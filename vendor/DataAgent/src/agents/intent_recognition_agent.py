import logging
import uuid

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import push_message
from langgraph.types import Command

from src.entity.states import PlanState
from src.llms.llm import get_llm_by_name
from src.prompts.template import apply_prompt_template
from src.utils.llm_utils import astream
from src.utils.tag_manager import tag_scope, MessageTag

logger = logging.getLogger(__name__)

class IntentRecognitionAgent:
    """Agent for recognizing customer intent from their questions."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    async def _get_intent(self, llm, messages, state, retry_cnt, config):
        result = await astream(llm, messages, {"thinking": {"type": "enabled"}}, config)
        intent = result.content.strip()
        logger.info(f"intent: {intent}")
        if 'SMALLTALK' not in intent and 'PLAN' not in intent:
            if retry_cnt < 3:
                retry_cnt = retry_cnt + 1
                messages.append({"role": "user", "content": f"Determine Intent. Just answer with these options: `PLAN`, `SMALLTALK`{'!' * retry_cnt}. The user question: {state['origin_user_question']}"})
                return await self._get_intent(llm, messages, state, retry_cnt, config)
        messages.append({"role": "assistant", "content": intent})
        return intent


    async def run(self, state: PlanState, config: RunnableConfig):
        with tag_scope(config, MessageTag.THINK):
            llm = get_llm_by_name(self.agent_name)
            user_question = state['user_question']
            rewrite_question = user_question
            history = state.get("history") or []
            rewrite_prompt = f"""
## User Question to be Rewritten
{user_question}

## Rewritten Question
        """
            ## Indicates this is a multi-turn conversation
            if len(history) > 0:
                input_ = {
                    "messages": history + [{"role": "user", "content": rewrite_prompt}],
                    "locale": state.get("locale")
                }
                messages = apply_prompt_template("rewrite_question", input_)
                result = await astream(llm, messages, {"thinking": {"type": "enabled"}}, config)
                rewrite_question = result.content.strip()
                state['user_question'] = rewrite_question
                logger.info(f"Question rewritten to: {rewrite_question}")

            history = history + [{"role": "user", "content": f"Determine Intent. The user question: {state['user_question']}"}]
            logger.info(f"messages: {history}")
            input_ = {
                "messages": history,
                "locale": state.get("locale")
            }

            messages = apply_prompt_template(self.agent_name, input_)
            intent = await self._get_intent(llm, messages, state, 0, config)

            goto = "plan_agent"
            if "SMALLTALK" in intent:
                goto = "small_talk_agent"
                push_message(HumanMessage(content="Intent recognized: Casual conversation mode", id=f"record-{str(uuid.uuid4())}"))
            else:
                push_message(HumanMessage(content="Intent recognized: Task planning mode", id=f"record-{str(uuid.uuid4())}"))
        
        return Command(
            update={
                "history": history + [{"role": "assistant", "content": intent}],
                "intent": intent,
                "user_question": rewrite_question,
                "materials": []
            },
            goto=goto
        )