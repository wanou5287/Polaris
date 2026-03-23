import argparse
import asyncio
import json
import logging
import os
import platform
from typing import List, cast
from uuid import uuid4

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk
from langgraph.types import Command
from pydantic import BaseModel, Field

from src.config.loader import load_yaml_config
from src.graph.builder import build_graph
from src.utils.tag_manager import TagFilter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


# Pydantic models for request/response
class ChatMessage(BaseModel):
    role: str = Field(..., description="The role of the message sender (user or assistant)")
    content: str = Field(..., description="The text content of the message")


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(
        default_factory=list,
        description="History of messages between the user and the assistant"
    )
    session_id: str = Field(
        default="__default__",
        description="A specific conversation identifier"
    )


# Create FastAPI app
app = FastAPI(
    title="Data Agent API",
    description="API for Data Agent",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Build workflow graph
graph = build_graph()

# Get system type
system = platform.system()

# Load configuration
config = load_yaml_config("conf.yaml")
default_locale = config.get("app", {}).get("locale", "zh-CN")
workspace_base_dir = config.get("app", {}).get("workspace_directory", {})
workspace_dir_linux = workspace_base_dir.get("linux", "/data/data_agent")
workspace_dir_windows = workspace_base_dir.get("windows", "D:/tmp")

# Track interrupt state for each conversation session
interrupt_flags: dict[str, bool] = {}


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat responses for a conversation session.
    Generates a new session_id if not provided.
    """
    session_id = request.session_id
    if session_id == "__default__":
        session_id = str(uuid4())
    return StreamingResponse(
        _astream_workflow_generator(
            request.model_dump()["messages"],
            session_id
        ),
        media_type="text/event-stream",
    )


async def _astream_workflow_generator(
        messages: List[ChatMessage],
        session_id: str
):
    """
    Generate streaming workflow responses for the chat.
    Creates workspace directory and handles conversation state.
    """
    # Create workspace directory for this session
    base_dir = workspace_dir_windows if system == "Windows" else workspace_dir_linux
    workspace_directory = f"{base_dir}/{session_id}"
    if not os.path.exists(workspace_directory):
        os.makedirs(workspace_directory)
        logger.info(f"Created workspace directory: {workspace_directory}")
    else:
        logger.info(f"Workspace directory already exists: {workspace_directory}")

    # Get the latest user message
    user_question = messages[-1].get("content")

    # Handle interrupt/resume flow
    if interrupt_flags.get(session_id):
        interrupt_flags[session_id] = False
        _input = Command(resume={"data": user_question})
    else:
        _input = {
            "user_question": user_question,
            "executed_steps": [],
            "current_plan": None,
            "ask_user_question": None,
            "retrieved_info": "",
            "locale": default_locale,
            "need_replan": True,
            "workspace_directory": workspace_directory
        }

    # Stream workflow execution
    async for agent, _, event_data in graph.astream(
            input=_input,
            config={
                "thread_id": session_id
            },
            stream_mode=["messages", "updates"],
            subgraphs=True,
    ):
        # Handle interrupt events
        if isinstance(event_data, dict):
            if "__interrupt__" in event_data:
                interrupt_items = event_data.get("__interrupt__") or []
                if interrupt_flags.get(session_id):
                    continue
                interrupt_flags[session_id] = True
                interrupt_message = {
                    "session_id": session_id,
                    "id": f"interrupt_{interrupt_items[0].id}",
                    "role": "assistant",
                    "content": f"❔{interrupt_items[0].value}",
                }
                yield _make_event("message_chunk", interrupt_message)
            continue

        message_chunk, message_metadata = cast(
            tuple[AIMessageChunk, dict[str, any]], event_data
        )

        # Filter messages based on tags
        tags = message_metadata.get('tags')
        if TagFilter.should_hide(tags):
            continue

        # Skip internal thinking and empty content
        content_piece = message_chunk.content
        if "think" in content_piece or "\n\n" == content_piece or '' == str(content_piece).strip():
            continue

        # Stream message chunk to client
        event_stream_message: dict[str, any] = {
            "session_id": session_id,
            "id": message_chunk.id,
            "role": "assistant",
            "content": message_chunk.content,
        }
        yield _make_event("message_chunk", event_stream_message)


def _make_event(event_type: str, data: dict[str, any]):
    """
    Format data as Server-Sent Event (SSE).
    Removes empty content fields.
    """
    if data.get("content") == "":
        data.pop("content")
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


if __name__ == "__main__":
    # Set event loop policy for Windows compatibility
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Run the data agent server")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload (default: False, not recommended on Windows)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind the server to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=10000,
        help="Port to bind the server to (default: 10000)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Log level (default: info)",
    )

    args = parser.parse_args()

    # Determine reload setting
    reload = args.reload

    logger.info(f"Starting data agent server on {args.host}:{args.port}")
    uvicorn.run(
        "server:app",
        host=args.host,
        port=args.port,
        reload=reload,
        log_level=args.log_level,
    )