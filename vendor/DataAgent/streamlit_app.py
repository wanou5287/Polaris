"""
Data Agent Streamlit Frontend
A beautiful chat interface for the Data Agent API
"""

import streamlit as st
import requests
import json
from datetime import datetime
from typing import Generator, Dict, Any
import time
import re
import ast

# Page configuration
st.set_page_config(
    page_title="Data Agent Chat",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better UI
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: 700;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .chat-message {
        padding: 1rem;
        border-radius: 0.5rem;
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
    }
    .user-message {
        background-color: #e3f2fd;
        margin-left: 2rem;
    }
    .assistant-message {
        background-color: #f5f5f5;
        margin-right: 2rem;
    }
    .message-role {
        font-weight: 600;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    .message-content {
        font-size: 1rem;
        line-height: 1.6;
    }
    .status-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        font-size: 0.85rem;
        font-weight: 500;
    }
    .status-connected {
        background-color: #4caf50;
        color: white;
    }
    .status-disconnected {
        background-color: #f44336;
        color: white;
    }
    /* Tighter spacing inside chat bubbles */
    .stChatMessage {
        margin-bottom: 0.25rem !important;
        padding-top: 0.25rem !important;
        padding-bottom: 0.25rem !important;
    }
    .stChatMessage .stMarkdown p {
        margin: 0.125rem 0 !important;
    }
    div[data-testid="stChatMessage"] {
        margin-bottom: 0.25rem !important;
        padding-top: 0.25rem !important;
        padding-bottom: 0.25rem !important;
    }
    div[data-testid="stChatMessage"] .stMarkdown p {
        margin: 0.125rem 0 !important;
    }
    /* Custom compact divider and titles */
    .chat-divider {
        border: 0;
        border-top: 1px solid #e6e6e6;
        margin: 8px 0;
    }
    .section-title {
        font-weight: 600;
        margin: 2px 0 4px 0;
        font-size: 0.95rem;
    }
</style>
""", unsafe_allow_html=True)


class DataAgentClient:
    """Client for Data Agent API"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.chat_endpoint = f"{self.base_url}/api/chat/stream"
    
    def check_server_status(self) -> bool:
        """Check if server is running"""
        try:
            response = requests.get(self.base_url, timeout=2)
            return True
        except requests.exceptions.RequestException:
            return False
    
    def chat_stream(self, user_input: str, session_id: str) -> Generator[Dict[str, Any], None, None]:
        """
        Send chat request and stream response
        
        Args:
            user_input: User's question
            session_id: Session ID for maintaining context
            
        Yields:
            Event dictionaries parsed from SSE stream:
            {
              "type": str,          # SSE event type or 'message'
              "id": str,            # message id (changes across LLM/tool phases)
              "content": str        # text chunk
            }
            Additionally emits {"type": "separator"} when message id changes.
        """
        messages = [{
            "role": "user",
            "content": user_input
        }]
        
        payload = {
            "messages": messages,
            "session_id": session_id
        }
        
        try:
            response = requests.post(
                self.chat_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                stream=True,
                timeout=180
            )
            
            if response.status_code != 200:
                yield {"type": "error", "content": f"❌ Error: HTTP {response.status_code}", "id": ""}
                return
            
            # Parse SSE (Server-Sent Events) stream
            last_message_id = None
            current_event_type = None
            for line in response.iter_lines(decode_unicode=True):
                if not line or line.strip() == "":
                    continue
                
                if line.startswith("event:"):
                    current_event_type = line.split(":", 1)[1].strip()
                    continue
                
                if line.startswith("data:"):
                    data_str = line.split(":", 1)[1].strip()
                    try:
                        data = json.loads(data_str)
                        content = data.get("content", "")
                        message_id = data.get("id", "")
                        
                        if isinstance(content, str) and content:
                            # Emit a separator when message id changes (new phase)
                            if last_message_id and message_id != last_message_id:
                                yield {"type": "separator", "id": message_id, "content": ""}
                            yield {
                                "type": current_event_type or "message",
                                "id": message_id or "",
                                "content": content
                            }
                            if message_id:
                                last_message_id = message_id
                    except json.JSONDecodeError:
                        continue
        
        except requests.exceptions.Timeout:
            yield {"type": "error", "content": "❌ Request timeout. Please try again.", "id": ""}
        except requests.exceptions.ConnectionError:
            yield {"type": "error", "content": "❌ Cannot connect to server. Please make sure the server is running.", "id": ""}
        except Exception as e:
            yield {"type": "error", "content": f"❌ Error: {str(e)}", "id": ""}


def initialize_session_state():
    """Initialize Streamlit session state"""
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "session_id" not in st.session_state:
        st.session_state.session_id = f"thread_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if "server_url" not in st.session_state:
        st.session_state.server_url = "http://localhost:10000"
    if "client" not in st.session_state:
        st.session_state.client = DataAgentClient(st.session_state.server_url)
    # Track sections for structured rendering
    if "current_sections" not in st.session_state:
        st.session_state.current_sections = []


def render_sidebar():
    """Render sidebar with settings and controls"""
    with st.sidebar:
        st.title("⚙️ Settings")
        
        # Server configuration
        st.subheader("Server Connection")
        server_url = st.text_input(
            "Server URL",
            value=st.session_state.server_url,
            placeholder="http://localhost:10000"
        )
        
        # Update server URL if changed
        if server_url != st.session_state.server_url:
            st.session_state.server_url = server_url
            st.session_state.client = DataAgentClient(server_url)
        
        # Check server status
        if st.button("🔍 Check Connection", use_container_width=True):
            with st.spinner("Checking server status..."):
                is_connected = st.session_state.client.check_server_status()
                if is_connected:
                    st.success("✅ Server is connected!")
                else:
                    st.error("❌ Cannot connect to server!")
        
        # Display connection status
        is_connected = st.session_state.client.check_server_status()
        if is_connected:
            st.markdown(
                '<div class="status-badge status-connected">● Connected</div>',
                unsafe_allow_html=True
            )
        else:
            st.markdown(
                '<div class="status-badge status-disconnected">● Disconnected</div>',
                unsafe_allow_html=True
            )
        
        st.divider()
        
        # Session information
        st.subheader("📝 Session Info")
        st.text(f"Session ID:\n{st.session_state.session_id}")
        st.text(f"Messages: {len(st.session_state.messages)}")
        
        # New session button
        if st.button("🔄 New Session", use_container_width=True):
            st.session_state.messages = []
            st.session_state.session_id = f"thread_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            st.rerun()
        
        # Clear chat button
        if st.button("🗑️ Clear Chat", use_container_width=True):
            st.session_state.messages = []
            st.rerun()

        # Removed About section
        
        # Quick examples
        # Removed Quick Examples section


def render_chat_history():
    """Render chat message history"""
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            if message["role"] == "assistant":
                # Check if message has structured sections
                if "sections" in message:
                    render_structured_message(message["sections"])
                else:
                    # Fallback for old messages without structure
                    st.markdown(message["content"])
            else:
                st.markdown(message["content"])


def classify_chunk(text: str, event_type: str | None) -> str:
    """
    Classify a text chunk into a readable section title.
    Heuristics based on common prefixes/keywords from agent output.
    """
    t = text.strip().lower()
    if t.startswith("intent recognized:") or t.startswith("intent recognized") or "creating execution plan" in t or "task planning" in t:
        return "🧭 Plan"
    if "analyzing the problem" in t:
        return "🧠 Reasoning"
    if t.startswith("preparing tool:") or "tool parameters" in t:
        return "🛠️ Tool"
    if "tool execution completed" in t or t.startswith("result:"):
        return "📦 Tool Result"
    if "analyzing and determining next action" in t or "reasoning:" in t:
        return "🧠 Reasoning"
    if "summarizing execution results" in t:
        return "📝 Summary"
    if "executing step" in t:
        return "🚶 Step"
    if "adjusting plan" in t or "replan" in t:
        return "🧭 Plan"
    if event_type and event_type not in ["message", "separator"]:
        return f"🔔 {event_type.title()}"
    return "💬 Message"

def looks_like_json(s: str) -> bool:
    """
    Heuristic: detect if a string looks like a complete JSON object/array
    without relying on code fences.
    """
    t = s.strip()
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        # Avoid tiny braces like "{}"
        if len(t) > 8:
            return True
    return False

def has_thought_and_steps(s: str) -> bool:
    """
    Check if the text contains both 'thought' and 'steps' fields,
    indicating it's a planning/reasoning JSON structure.
    """
    if not s or len(s) < 20:
        return False
    lower = s.lower()
    # Check for both fields (case-insensitive)
    has_thought = '"thought"' in lower or "'thought'" in lower
    has_steps = '"steps"' in lower or "'steps'" in lower
    return has_thought and has_steps


def format_plan_markdown(plan: dict[str, Any] | None) -> str | None:
    """
    Convert a plan JSON object into a readable markdown summary.
    Shows thought, goal title, and each step (title, description, agent).
    """
    if not isinstance(plan, dict):
        return None
    
    lines: list[str] = []
    thought = plan.get("thought")
    goal_title = plan.get("title")
    steps = plan.get("steps", [])
    
    if thought:
        lines.append(f"**Thought:** {thought}")
    if goal_title:
        lines.append(f"**Goal:** {goal_title}")
    
    if isinstance(steps, list) and steps:
        lines.append("")
        for idx, step in enumerate(steps, 1):
            if isinstance(step, dict):
                step_title = step.get("title")
                step_agent = step.get("agent")
                step_desc = step.get("description")
                
                step_line_parts: list[str] = [f"{idx}."]
                if step_title:
                    step_line_parts.append(f"**{step_title}**")
                if step_agent:
                    step_line_parts.append(f"_({step_agent})_")
                
                lines.append(" ".join(step_line_parts).strip())
                
                if step_desc:
                    # Indent description for readability
                    lines.append(f"   {step_desc}")
            else:
                lines.append(f"{idx}. {step}")
    
    return "\n\n".join(filter(None, lines)) or None

def try_extract_complete_json(buffer: str) -> tuple[str | None, str]:
    """
    Try to extract a complete JSON object from the buffer.
    Handles both raw JSON and JSON wrapped in ```json code blocks.
    Returns (complete_json_str, remaining_buffer).
    If no complete JSON found, returns (None, original_buffer).
    """
    if not buffer or len(buffer) < 10:
        return None, buffer
    
    # Check if JSON is wrapped in code fence
    code_fence_start = buffer.find('```json')
    code_fence_end = -1
    json_start_offset = 0
    
    if code_fence_start != -1:
        # Find the closing ```
        code_fence_end = buffer.find('```', code_fence_start + 7)
        if code_fence_end != -1:
            # Extract content between ```json and ```
            json_content = buffer[code_fence_start + 7:code_fence_end].strip()
            remaining = buffer[code_fence_end + 3:]
            return json_content, remaining
        else:
            # Code fence started but not closed yet, continue buffering
            return None, buffer
    
    # Find the first opening brace (raw JSON without code fence)
    start = buffer.find('{')
    if start == -1:
        return None, buffer
    
    # Try to find matching closing brace
    brace_count = 0
    in_string = False
    escape_next = False
    
    for i in range(start, len(buffer)):
        char = buffer[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"':
            in_string = not in_string
            continue
        
        if not in_string:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    # Found complete JSON object
                    json_str = buffer[start:i+1]
                    remaining = buffer[i+1:]
                    return json_str, remaining
    
    # No complete JSON found yet
    return None, buffer

def try_parse_and_format_json(s: str) -> str | None:
    """
    Try to parse the string as JSON and return a pretty-formatted version.
    Returns None if parsing fails.
    """
    try:
        # Try to find JSON content if it's embedded in text
        t = s.strip()
        # Find the JSON object boundaries
        start = t.find('{')
        end = t.rfind('}')
        if start >= 0 and end > start:
            json_str = t[start:end+1]
            parsed = json.loads(json_str)
            # Pretty format with indentation
            return json.dumps(parsed, indent=2, ensure_ascii=False)
    except (json.JSONDecodeError, ValueError):
        pass
    return None

def split_logical_chunks(text: str) -> list[str]:
    """
    Split a large text chunk into logical parts by known markers,
    while keeping the markers at the start of each segment.
    """
    if not text:
        return []
    # Filter out undefined/null strings
    text_stripped = text.strip()
    if text_stripped in ("undefined", "null", ""):
        return []
    # Also filter if it's only whitespace with undefined
    if text_stripped == "undefined" or text_stripped == "null":
        return []
    # Markers to split before (include common English phrases seen in responses)
    raw_markers = [
        "Preparing tool:",
        "Tool execution completed",
        "Agent analyzing and determining next action",
        "Summarizing execution results",
        "Executing step:",
        "Intent recognized:",  # Changed to include colon
        "Task planning",
        "Task planning mode",
        "Analyzing the problem",
        "Creating execution plan",
        "Adjusting plan",
        "Reasoning:",
        "```json",
        "```ts",
        "```",
        "\n\n",  # Split on double newlines to preserve paragraph breaks
    ]
    # Build a single regex that matches any marker
    pattern = "(" + "|".join(re.escape(m) for m in raw_markers) + ")"
    # Find all marker positions
    indices = [0]
    for m in re.finditer(pattern, text):
        idx = m.start()
        if idx not in indices and idx > 0:  # Don't add 0 twice
            indices.append(idx)
    indices.sort()  # Make sure indices are in order
    if not indices or indices[-1] != len(text):
        indices.append(len(text))
    # Slice text by indices
    segments: list[str] = []
    for i in range(len(indices) - 1):
        start = indices[i]
        end = indices[i + 1]
        segment = text[start:end]
        segment_stripped = segment.strip()
        # Filter out empty segments and undefined/null strings
        if segment_stripped and segment_stripped not in ("undefined", "null"):
            segments.append(segment)
    return segments if segments else [text] if text.strip() not in ("undefined", "null") else []

def render_structured_message(sections: list[dict[str, Any]]):
    """
    Render a structured message from saved section data.
    This preserves the exact formatting from when it was first streamed.
    """
    container = st.container()
    for i, sec in enumerate(sections):
        if i > 0:
            container.markdown("<div style='height:0.15rem'></div>", unsafe_allow_html=True)
        
        box = container.container()
        box.markdown(f'<div class="section-title">{sec["title"]}</div>', unsafe_allow_html=True)
        
        # Render main content
        if sec["title"] == "🛠️ Tool":
            sanitized = sanitize_tool_text_remove_code(sec["text"])
            box.markdown(sanitized)
        elif sec.get("is_plan"):
            plan_md = sec["text"]
            plan_obj = sec.get("plan")
            if plan_obj:
                formatted_plan = format_plan_markdown(plan_obj)
                if formatted_plan:
                    plan_md = formatted_plan
            box.markdown(plan_md)
        elif sec.get("is_code"):
            box.markdown(f"```json\n{sec['text']}\n```")
        elif sec["title"] == "📋 Plan" and looks_like_json(sec["text"]):
            box.markdown(f"```json\n{sec['text']}\n```")
        else:
            box.markdown(sec["text"])
        
        # Render code if present
        if sec.get("code"):
            box.markdown(f"```python\n{sec['code']}\n```")

def extract_python_code_from_tool(text: str) -> str | None:
    """
    When tool is run_python_code and parameters include a 'code' field,
    extract and pretty-print the Python code for display.
    """
    if "run_python_code" not in text or "'code'" not in text:
        return None
    # Try to capture the single-quoted python string for 'code'
    m = re.search(r"'code'\s*:\s*'((?:\\'|[^'])*)'", text, re.DOTALL)
    if not m:
        return None
    raw = m.group(1)
    try:
        # Safely unescape using Python string literal rules
        unescaped: str = ast.literal_eval("'" + raw + "'")
        cleaned = unescaped.strip()
        if cleaned.lower() in {"undefined", "null", ""}:
            return None
        return unescaped
    except Exception:
        # Fallback: replace common escapes
        cleaned = raw.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "\r").replace("\\\\", "\\").strip()
        if cleaned.lower() in {"undefined", "null", ""}:
            return None
        return cleaned

def sanitize_tool_text_remove_code(text: str) -> str:
    """
    Remove the long python 'code' value from Tool parameters to avoid duplication.
    Keeps a short placeholder so the rest of parameters remain visible.
    """
    return re.sub(
        r"'code'\s*:\s*'((?:\\'|[^'])*)'",
        "'code': '<code omitted>'",
        text,
        flags=re.DOTALL
    )


def main():
    """Main application"""
    initialize_session_state()
    
    # Header
    st.markdown('<div class="main-header">🤖 Data Agent Chat</div>', unsafe_allow_html=True)
    
    # Sidebar
    render_sidebar()
    
    # Main chat area
    st.markdown("### 💬 Chat")
    
    # Display chat history
    render_chat_history()
    
    # Chat input
    user_input = st.chat_input("Type your message here...")
    
    # Process user input
    if user_input:
        # Check server connection first
        if not st.session_state.client.check_server_status():
            st.error("❌ Cannot connect to server. Please check your server URL and make sure the server is running.")
            return
        
        # Add user message to chat
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)
        
        # Get assistant response
        with st.chat_message("assistant"):
            # Container to hold dynamic sections
            sections_container = st.container()
            # Internal state for dynamic rendering
            sections = []  # list of dicts: {"title": str, "text": str, "area": st.delta_generator}
            last_section_title = None
            in_code_block = False
            full_response = ""
            # Buffer for detecting structured JSON (like plan objects)
            json_buffer = ""
            json_start_detected = False
            
            try:
                # Stream response from API
                for event in st.session_state.client.chat_stream(
                    user_input,
                    st.session_state.session_id
                ):
                    # Backward compatibility if a string ever appears
                    if not isinstance(event, dict):
                        event = {"type": "message", "content": str(event), "id": ""}
                    
                    etype = event.get("type", "message")
                    content_chunk = event.get("content", "")
                    
                    # Handle phase separator
                    if etype == "separator":
                        # Finalize previous section (remove streaming cursor)
                        if sections:
                            sections[-1]["area"].markdown(sections[-1]["text"])
                        last_section_title = None  # force new section on next content
                        # Reset JSON buffer on phase change
                        json_buffer = ""
                        json_start_detected = False
                        # Visual divider between phases
                        sections_container.markdown('<hr class="chat-divider" />', unsafe_allow_html=True)
                        continue
                    
                    if not content_chunk:
                        continue
                    
                    # Filter out undefined/null strings
                    if content_chunk.strip() in ("undefined", "null"):
                        continue
                    
                    full_response += content_chunk
                    
                    # Buffer management for JSON detection
                    # Detect potential JSON start (either ```json or raw {)
                    if not json_start_detected and ('```json' in content_chunk or '{' in content_chunk):
                        json_start_detected = True
                        json_buffer = ""
                    
                    # Accumulate buffer if we're potentially in a JSON structure
                    if json_start_detected:
                        json_buffer += content_chunk
                        
                        # Try to extract complete JSON
                        complete_json, remaining = try_extract_complete_json(json_buffer)
                        
                        if complete_json and has_thought_and_steps(complete_json):
                            # Found a complete plan JSON!
                            plan_markdown: str | None = None
                            plan_obj: dict[str, Any] | None = None
                            try:
                                plan_obj = json.loads(complete_json)
                                plan_markdown = format_plan_markdown(plan_obj)
                            except json.JSONDecodeError:
                                plan_obj = None
                            
                            if not plan_markdown:
                                formatted = try_parse_and_format_json(complete_json)
                                fallback = formatted or complete_json.strip()
                                if fallback:
                                    plan_markdown = f"```json\n{fallback}\n```"
                            
                            if plan_markdown:
                                # Finalize any previous section
                                if sections:
                                    sections[-1]["area"].markdown(sections[-1]["text"])
                                    sections_container.markdown("<div style='height:0.15rem'></div>", unsafe_allow_html=True)
                                
                                title = "📋 Plan"
                                box = sections_container.container()
                                box.markdown(f'<div class="section-title">{title}</div>', unsafe_allow_html=True)
                                area = box.empty()
                                code_area = box.empty()
                                sections.append({
                                    "title": title,
                                    "text": plan_markdown,
                                    "area": area,
                                    "is_code": False,
                                    "code_area": code_area,
                                    "is_plan": bool(plan_obj),
                                    "plan": plan_obj
                                })
                                last_section_title = title
                                area.markdown(plan_markdown)
                                
                                # Reset buffer and process remaining content
                                json_buffer = remaining
                                json_start_detected = False
                                
                                # If there's remaining content, process it normally
                                if remaining.strip():
                                    content_chunk = remaining
                                else:
                                    continue
                            else:
                                # Failed to format, continue buffering
                                continue
                        else:
                            # Not complete yet or not a plan JSON, continue buffering
                            # Check if we should stop buffering (too large or complete but not a plan)
                            has_closing_fence = '```' in json_buffer and json_buffer.count('```') >= 2
                            has_closing_brace = '}' in json_buffer
                            
                            if len(json_buffer) > 5000:
                                # Buffer too large, give up and process as normal content
                                content_chunk = json_buffer
                                json_buffer = ""
                                json_start_detected = False
                            elif has_closing_fence or (has_closing_brace and '```json' not in json_buffer):
                                # Has closing marker but doesn't match plan pattern
                                if not has_thought_and_steps(json_buffer):
                                    content_chunk = json_buffer
                                    json_buffer = ""
                                    json_start_detected = False
                                else:
                                    # Keep buffering (might need more content)
                                    continue
                            else:
                                # Continue buffering
                                continue
                    
                    # Break down large chunks by logical markers to improve readability
                    sub_chunks = [content_chunk] if in_code_block else split_logical_chunks(content_chunk)
                    if not sub_chunks:
                        # If splitting filtered it out (e.g., undefined/null), skip rendering
                        continue
                    for sub in sub_chunks:
                        # Filter out undefined/null in sub chunks too
                        if sub.strip() in ("undefined", "null", ""):
                            continue
                        s = sub
                        
                        # Skip if this is a ```json code fence that was already processed as plan
                        if s.strip().startswith("```json") or s.strip() == "```":
                            # Check if this might be leftover from plan JSON extraction
                            if "thought" in s.lower() or "steps" in s.lower() or len(s.strip()) < 10:
                                continue
                        
                        # Manage code block state
                        if s.strip().startswith("```"):
                            in_code_block = not in_code_block if "```" in s.strip() and s.strip() != "```json" and s.strip() != "```ts" else True
                            title = "📄 Code/JSON"
                        elif in_code_block:
                            title = "📄 Code/JSON"
                            # Detect closing fence inside stream
                            if "```" in s:
                                in_code_block = False
                        else:
                            # If looks like complete JSON, render as code
                            if looks_like_json(s):
                                title = "📄 Code/JSON"
                            else:
                                title = classify_chunk(s, etype)
                        
                        # Start a new section if category changes
                        if not sections or title != last_section_title:
                            # Finalize previous section to remove streaming cursor
                            if sections:
                                sections[-1]["area"].markdown(sections[-1]["text"])
                            # Add divider between logical categories (within a phase)
                            if sections:
                                sections_container.markdown("<div style='height:0.15rem'></div>", unsafe_allow_html=True)
                            box = sections_container.container()
                            box.markdown(f'<div class="section-title">{title}</div>', unsafe_allow_html=True)
                            area = box.empty()
                            code_area = box.empty()  # optional area for tool code display
                            sections.append({"title": title, "text": "", "area": area, "is_code": (title == "📄 Code/JSON"), "code_area": code_area})
                            last_section_title = title
                        
                        # Append content and render
                        sections[-1]["text"] += s
                        if sections[-1].get("is_code"):
                            sections[-1]["area"].markdown(f"```json\n{sections[-1]['text']}\n```")
                        else:
                            # If Tool section contains python code, hide it in the text area
                            if sections[-1]["title"] == "🛠️ Tool":
                                sanitized = sanitize_tool_text_remove_code(sections[-1]["text"])
                                sections[-1]["area"].markdown(sanitized + "▌")
                            else:
                                sections[-1]["area"].markdown(sections[-1]["text"] + "▌")
                        # If this is Tool section, try to extract embedded python code and render it nicely
                        if sections[-1]["title"] == "🛠️ Tool":
                            code_text = extract_python_code_from_tool(sections[-1]["text"])
                            if code_text:
                                sections[-1]["code_area"].markdown(f"```python\n{code_text}\n```")
                
                # Display final response
                if not sections:
                    # Fallback if nothing was parsed
                    sections_container.markdown(full_response)
                else:
                    # Finalize all sections to ensure no trailing cursor remains
                    for sec in sections:
                        if sec.get("is_code"):
                            sec["area"].markdown(f"```json\n{sec['text']}\n```")
                        else:
                            if sec["title"] == "🛠️ Tool":
                                sec["area"].markdown(sanitize_tool_text_remove_code(sec["text"]))
                            else:
                                sec["area"].markdown(sec["text"])
                        if sec["title"] == "🛠️ Tool":
                            code_text = extract_python_code_from_tool(sec["text"])
                            if code_text:
                                sec["code_area"].markdown(f"```python\n{code_text}\n```")
                
                # Add assistant response to chat history with structured sections
                # Convert sections to serializable format (remove streamlit objects)
                saved_sections = []
                for sec in sections:
                    saved_sec = {
                        "title": sec["title"],
                        "text": sec["text"],
                        "is_code": sec.get("is_code", False)
                    }
                    if sec.get("is_plan"):
                        saved_sec["is_plan"] = True
                        if sec.get("plan") is not None:
                            saved_sec["plan"] = sec.get("plan")
                    # Extract and save code separately if it's a Tool section
                    if sec["title"] == "🛠️ Tool":
                        code_text = extract_python_code_from_tool(sec["text"])
                        if code_text:
                            saved_sec["code"] = code_text
                    saved_sections.append(saved_sec)
                
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": full_response,
                    "sections": saved_sections  # Save structured data
                })
            
            except Exception as e:
                error_message = f"❌ Error: {str(e)}"
                sections_container.markdown(error_message)
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": error_message
                })


if __name__ == "__main__":
    main()

