import logging

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command

from src.entity.states import PlanState
from src.llms.llm import get_llm_by_name
from src.prompts.template import apply_prompt_template
from src.utils.llm_utils import astream

logger = logging.getLogger(__name__)
class SmallTalkAgent:
    """Agent responsible for casual conversation."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    async def run(self, state: PlanState, config: RunnableConfig):
        llm = get_llm_by_name(self.agent_name)
        messages = state["history"]
        input_ = {
            "messages": messages,
            "locale": state.get("locale")
        }

        messages = apply_prompt_template(self.agent_name, input_)
        result = await astream(llm, messages, {"temperature": 1}, config)
        messages.append({"role": "assistant", "content": result.content})
        logger.info(f"content: {result.content}")

        return Command(
            update={
                "history": [msg for msg in messages if msg['role'] != 'system']
            },
            goto="__end__",
        )
