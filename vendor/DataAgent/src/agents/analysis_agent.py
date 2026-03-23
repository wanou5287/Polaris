import logging
import uuid

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import push_message

from src.agents.react_agent_base import ReActAgentBase
from src.entity.states import StepState
from src.utils.python_execute import run_python_code

logger = logging.getLogger(__name__)


class AnalysisAgent(ReActAgentBase):

    def __init__(self, agent_name: str):
        super().__init__(
            agent_name=agent_name,
            max_iterations=10,
            react_llm="react_agent",
        )

    async def run(self, state: StepState, config: RunnableConfig):
        push_message(HumanMessage(content=f"Routing to: {self.agent_name}", id=f"record-{str(uuid.uuid4())}"))
        tools = await super().build_tools()
        tools.append(run_python_code)
        self.tools = tools
        workspace_directory = state["workspace_directory"]
        current_step = state["current_step"]
        self.workspace_directory = workspace_directory
        self.current_step = current_step
        res = await self._execute_agent_step(step_state=state, config=config)
        return {"execute_res": res}

