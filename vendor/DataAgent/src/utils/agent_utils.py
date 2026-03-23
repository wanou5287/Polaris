import logging

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.constants import START
from langgraph.graph import StateGraph
from langgraph.types import Command

from src.entity.planner_model import Step
from src.entity.states import StepState

logger = logging.getLogger(__name__)

def _initialize_agents():
    from src.agents.intent_recognition_agent import IntentRecognitionAgent
    from src.agents.small_talk_agent import SmallTalkAgent
    from src.agents.report_agent import ReportAgent
    from src.agents.plan_agent import PlanAgent

    _AGENTS = {
        "intent_recognition_agent": IntentRecognitionAgent(agent_name="intent_recognition_agent"),
        "small_talk_agent": SmallTalkAgent(agent_name="small_talk_agent"),
        "report_agent": ReportAgent(agent_name="report_agent"),
        "plan_agent": PlanAgent(agent_name="plan_agent"),
    }
    return _AGENTS


def create_task_description_handoff_tool(
    *, agent, description: str | None = None
):
    agent_name = agent.agent_name
    name = f"transfer_to_{agent_name}"
    description = description or f"Ask {agent_name} for help."

    @tool(name, description=description)
    async def handoff_tool(
        messages: list[dict],
        workspace_directory: str,
        current_step: Step,
        locale: str,
        config: RunnableConfig
    ) -> Command:
        builder = StateGraph(StepState)
        builder.add_node(agent_name, agent.run)
        builder.add_edge(START, agent_name)
        chain = builder.compile()
        result = await chain.ainvoke({"history": messages, "workspace_directory": workspace_directory, "current_step": current_step, "locale": locale}, config=config)
        return result
    return handoff_tool