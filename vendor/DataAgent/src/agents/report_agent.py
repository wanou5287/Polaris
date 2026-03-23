import json
import logging
import uuid

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import push_message
from langgraph.types import Command

from src.entity.states import PlanState
from src.llms.llm import get_llm_by_name
from src.prompts.template import get_prompt_without_render
from src.utils.llm_utils import astream

logger = logging.getLogger(__name__)
import platform

system = platform.system()


class ReportAgent:
    """Agent responsible for generating the final report."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    def _extract_last_assistant_message(self, messages):
        """Extract the most recent assistant message content."""
        for msg in reversed(messages or []):
            if isinstance(msg, dict) and msg.get("content"):
                return msg.get("content")
        return ""

    def _format_execution_results(self, executed_steps):
        """Format executed steps into JSON strings."""
        results = []
        for step in executed_steps:
            results.append(json.dumps({
                "title": step.title,
                "description": step.description,
                "execution_result": step.summary_execution_res
            }, indent=2, ensure_ascii=False))
        return results

    async def run(self, state: PlanState, config: RunnableConfig):
        push_message(HumanMessage(
            content="Generating final analysis report",
            id=f"record-{uuid.uuid4()}"
        ))

        messages = state.get("history") or []
        executed_steps = state['executed_steps']
        user_question = state['user_question']

        last_assistant_content = self._extract_last_assistant_message(messages)

        system_prompt = get_prompt_without_render("analysis_report")
        exec_results = self._format_execution_results(executed_steps)
        exec_results.append(last_assistant_content)

        user_prompt = f"""
## Original User Question
{user_question}

## Execution Results
{"\n".join(exec_results)}

Please generate an analysis report for me. Remember, only generate it based on the execution result data I provided. Never fabricate, simulate, or calculate data yourself, or I will go crazy!! Especially for multiples, ratios, percentages - if these are not in the result data, don't calculate them yourself.
"""

        user_msg = {"role": "user", "content": user_prompt}
        messages.append(user_msg)

        report_messages = [
            {"role": "system", "content": system_prompt},
            user_msg
        ]

        logger.info(f"Report messages: {report_messages}")

        llm = get_llm_by_name(self.agent_name)
        result = await astream(llm, report_messages, {"thinking": {"type": "enabled"}}, config)
        response_content = result.content

        messages.append({"role": "assistant", "content": response_content})
        logger.info(f"User question: {user_question}. Final report: {response_content}")

        return Command(
            update={"history": [msg for msg in messages if msg['role'] != 'system']},
            goto="__end__",
        )