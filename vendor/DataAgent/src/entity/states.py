from langgraph.graph import MessagesState

from src.entity.planner_model import Plan, Step


class PlanState(MessagesState):
    """State for the agent system, extends MessagesState with next field."""

    # Runtime Variables
    locale: str = ""
    ask_user_question: str = None
    current_plan: Plan | str = None
    history: list[dict] = []
    user_question: str = ""
    replan_cnt: int = 0
    executed_steps: list[Step] = []
    workspace_directory: str = ""
    retrieved_info: str = ""
    need_replan: bool = True


class StepState(MessagesState):
    """State for the agent system, extends MessagesState with next field."""

    # Runtime Variables
    locale: str = ""
    history: list[dict] = []
    execute_res: str = None
    workspace_directory: str = ""
    current_step: Step = None