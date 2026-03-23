from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, START
from langgraph.types import interrupt, Command

from src.entity.states import PlanState
from src.utils.agent_utils import _initialize_agents

def ask_user_node(state: PlanState):
    ask_user_question = state["ask_user_question"]
    feedback = interrupt(ask_user_question)

    answer = str(feedback.get('data'))
    if answer.lower() == 'continue':
        return Command(
            update={
                "need_replan": False
            },
            goto="plan_agent"
        )
    else:
        update_messages= [{"role": "user", "content": f"Regarding the question of [{ask_user_question}], my answer is: {answer}"}]
        return Command(
                update={
                    "history": state["history"] + update_messages,
                },
                goto="plan_agent"
            )

def _build_base_graph():
    """Build and return the base state graph with all nodes and edges."""
    agents = _initialize_agents()
    builder = StateGraph(PlanState)

    builder.add_node("intent_recognition_agent", agents["intent_recognition_agent"].run)
    builder.add_node("small_talk_agent", agents["small_talk_agent"].run)
    builder.add_node("report_agent", agents["report_agent"].run)
    builder.add_node("plan_agent", agents["plan_agent"].run)
    builder.add_node("ask_user", ask_user_node)

    builder.add_edge(START, "intent_recognition_agent")
    return builder


def build_graph():
    # build state graph
    memory = MemorySaver()
    builder = _build_base_graph()
    return builder.compile(checkpointer=memory)