import logging
import uuid

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import push_message

from src.agents.react_agent_base import ReActAgentBase
from src.config.loader import load_yaml_config
from src.entity.states import StepState
from src.utils.python_execute import run_python_code
from src.utils.tools import list_available_csv_files

logger = logging.getLogger(__name__)


class SaleAgent(ReActAgentBase):

    def __init__(self, agent_name: str):
        # Load configuration to check if tables and CSV are configured
        config = load_yaml_config("conf.yaml")
        data_sources = config.get("agents", {}).get("data_sources", {}).get("sale_agent", {})
        tables_config = data_sources.get("tables", [])
        csv_config = data_sources.get("csv", [])
        
        # Build MCP servers dict conditionally
        mcp_servers = {
            "date": {
                "url": "http://localhost:9095/sse",
                "transport": "sse",
            }
        }
        
        # Only add table MCP service if tables are configured
        if tables_config:
            mcp_servers["table"] = {
                "url": "http://localhost:9100/sse",
                "transport": "sse",
            }
        
        # Store CSV configuration flag for later use in run method
        self.has_csv_config = bool(csv_config)
        
        super().__init__(
            agent_name=agent_name,
            mcp_servers=mcp_servers,
            max_iterations=15,
            react_llm="react_agent",
        )

    async def run(self, state: StepState, config: RunnableConfig):
        push_message(HumanMessage(content=f"Routing to: {self.agent_name}", id=f"record-{str(uuid.uuid4())}"))
        workspace_directory = state["workspace_directory"]
        current_step = state["current_step"]
        self.workspace_directory = workspace_directory
        self.current_step = current_step

        tools = await super().build_tools()
        tools.append(run_python_code)
        
        # Add list_available_csv_files tool if CSV files are configured
        if self.has_csv_config:
            tools.append(list_available_csv_files)
        
        self.tools = tools

        res = await self._execute_agent_step(step_state=state, config=config)
        return {"execute_res": res}

