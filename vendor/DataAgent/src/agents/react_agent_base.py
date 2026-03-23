import json
import logging
import traceback
import uuid
from abc import abstractmethod, ABC
from typing import List, Dict, Any, Tuple

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph.message import push_message

from src.entity.planner_model import Step
from src.entity.states import StepState
from src.llms.llm import get_llm_by_name
from src.prompts.template import apply_prompt_template
from src.utils.format_utils import repair_json_output
from src.utils.llm_utils import astream
from src.utils.rag_helper import RAGHelper
from src.utils.tag_manager import tag_scope, MessageTag
from src.utils.tools import terminate, read_file_head3, read_file_head20, feedback

logger = logging.getLogger(__name__)

# Constants
THINK_PROMPT_NO_EXPLAIN = """
Based on the current state, determine what to do next. Note: Only execute the current task: {task_description}

Carefully read the current task, the results from the previous step, the original user question, and previously executed steps before deciding on the next action.

Please strictly refer to the information retrieved below. Metric calculation formulas MUST strictly follow the retrieved information. Pay special attention to default rules - when users have not explicitly specified something, use the default rules from the retrieved information.

## Retrieved information as follows (between --BEGIN-- and --END--):
------BEGIN------
{retrieve_info}
------END------

# Note:
**If tool calls fail multiple times, call the `terminate` tool to end the task**
""".strip()

THINK_PROMPT_WITH_EXPLAIN = """
Based on the current state, think about what to do next. Note: Only execute the current task: {task_description}

# Core Rules
Carefully read the current task and the results of the previous operation, then:
1. Briefly explain your thinking for the next step in your response (the specific tool names and parameters to call should be returned via function call)
2. Both the reasoning and function_call MUST be returned in the same response - neither can be missing.
3. Performance Considerations
- **Bulk vs. Iterative Retrieval**: Bulk retrieval + pandas processing is faster than multiple API calls
- **Filter Threshold**: When filtering by large lists (>=10 items), retrieve full dataset once and filter locally rather than making excessive parameterized calls. This approach is not only faster but also reduces the risk of errors caused by passing numerous parameters.
- **Aggregation Location**: Perform aggregations at data source when supported (e.g., GraphQL groupBy, database SUM/AVG) to reduce data transfer
4. Do not perform any analysis or calculations unrelated to the task
5. When calling the `run_python_code` tool, do not generate words like "report"
6. When certain data or metrics cannot be obtained, do not simulate, guess, or substitute - just report the situation honestly at the end of the task

# Strictly Follow
Please strictly refer to the retrieved information below. The calculation formulas, fields, and default values for metrics required by the task MUST strictly follow the retrieved information. Pay special attention to default rules - when users don't explicitly specify something, use the default rules from the retrieved information.

## Retrieved information as follows (between --BEGIN-- and --END--):
--BEGIN--
{retrieve_info}
--END--

# Error Examples (Prohibited)

❌ Error 1: Only returning reasoning without returning function_call
❌ Error 2: Only returning function_call without returning reasoning
❌ Error 3: Mentioning specific tool names in the reasoning

# Note:
**Tool calls MUST be returned in function call format, not as text output like: "Calling tool: ..."**
**If tool calls fail multiple times, call the `terminate` tool to end the task**
""".strip()

SAME_ANSWER_PROMPT = "The same answer as before has been detected. Please avoid repeating identical responses and generate a new answer instead"


class ReActAgentBase(ABC):

    def __init__(
        self,
        agent_name: str,
        *,
        mcp_servers: dict | None = None,
        max_iterations: int = 10,
        react_llm: str = "react_agent",
    ):
        self.agent_name = agent_name
        self.mcp_servers = mcp_servers or {}
        self.max_iterations = max_iterations
        self.react_llm = react_llm
        self.tools = None
        self.workspace_directory = None
        self.current_step: Step = None
        self.retrieve_info = 'None available'

    @staticmethod
    def _generate_record_id() -> str:
        """Generate a unique record ID for message tracking."""
        return f"record-{str(uuid.uuid4())}"

    @staticmethod
    def _normalize_tool_calls(calls: List[Dict]) -> tuple:
        """Normalize tool calls for signature comparison."""
        normalized = []
        for tc in calls or []:
            name = tc.get('name', '')
            args = tc.get('args', tc.get('arguments', {}))
            if isinstance(args, dict):
                args = sorted(args.items())
            normalized.append((name, str(args)))
        return tuple(normalized)

    def _make_think_signature(self, think_res) -> str:
        """Create a unique signature for think results to detect duplicates."""
        try:
            signature_obj = {
                "content": getattr(think_res, 'content', ''),
                "tool_calls": self._normalize_tool_calls(getattr(think_res, 'tool_calls', []) or []),
                "invalid_tool_calls": self._normalize_tool_calls(getattr(think_res, 'invalid_tool_calls', []) or []),
            }
            return json.dumps(signature_obj, ensure_ascii=False, sort_keys=True)
        except Exception:
            return str(think_res)

    async def retrieve_step_information(self, step_title: str, step_description: str, config) -> str:
        """
        Perform RAG retrieval based on the current step's title and description.

        Args:
            step_title: Title of the current step
            step_description: Description of the current step
            config: Runnable configuration

        Returns:
            Retrieved relevant information formatted as a string
        """
        try:
            # Initialize RAG helper
            extract_llm = get_llm_by_name("extract")
            rag_helper = RAGHelper(extract_llm)

            # Build search query - using title and description
            query = f"{step_title}\n{step_description}"

            # Perform retrieval with optional dataset filtering
            retrieved_info = await rag_helper.retrieve_information(
                question=query,
                config=config,
                dataset=self.agent_name,  # Use agent name as dataset filter
                include_agent_data_sources=False
            )

            if retrieved_info:
                return retrieved_info
            else:
                return ""

        except Exception as e:
            logger.warning(f"RAG retrieval failed for step '{step_title}': {str(e)}. Continuing without retrieval.")
            return ""

    async def _think(self, no_action: bool, llm, tools, think_messages: List[Dict], 
                     retrieve_info: str, config: RunnableConfig) -> Tuple[bool, Any]:
        """Execute the thinking step of the agent."""
        # Skip adding prompt if checking for same answer
        if 'same answer' not in think_messages[-1]['content']:
            prompt = THINK_PROMPT_NO_EXPLAIN if no_action else THINK_PROMPT_WITH_EXPLAIN
            content = prompt.format(
                task_description=self.current_step.description,
                retrieve_info=retrieve_info
            )
            think_messages.append({"role": "user", "content": content})
        
        logger.info(f"Think messages: {think_messages}.")
        push_message(HumanMessage(
            content="Agent analyzing and determining next action", 
            id=self._generate_record_id()
        ))
        
        model_with_tools = llm.bind_tools(tools, tool_choice="auto")
        result = await astream(
            model_with_tools, 
            think_messages,
            {"thinking": {"type": "enabled"}, "temperature": 0.01}, 
            config
        )
        
        # Check if there are valid tool calls
        has_tool_calls = len(result.tool_calls) > 0 or len(result.invalid_tool_calls) > 0
        if has_tool_calls and result.tool_calls:
            push_message(HumanMessage(
                content=f"Reasoning: {result.content}", 
                id=self._generate_record_id()
            ))
        
        return has_tool_calls, result

    def _parse_tool_args(self, tool_call: Dict) -> Dict:
        """Parse and normalize tool arguments."""
        args = tool_call.get('args') or tool_call.get('arguments')
        if isinstance(args, str):
            args = json.loads(repair_json_output(args))
        return args

    def _parse_result(self, result: Any) -> Any:
        """Parse string results to JSON if possible."""
        if not isinstance(result, str):
            return result
        try:
            return json.loads(repair_json_output(result))
        except Exception:
            return result

    async def _execute_single_tool(self, tool_call: Dict, tool_map: Dict, 
                                   messages: List[Dict], results: List[Dict]) -> Dict | None:
        """Execute a single tool call. Returns termination dict if tool is terminate/feedback, None otherwise."""
        tool_name = str(tool_call['name']).strip()
        if not tool_name:
            return {"terminate": "unknown"}
        
        tool = tool_map.get(tool_name)
        args = self._parse_tool_args(tool_call)
        
        # Log tool preparation
        tool_msg = f"Preparing tool: '{tool_name}'\nTool parameters: {args}"
        push_message(HumanMessage(content=tool_msg, id=self._generate_record_id()))
        logger.info(f"tool_msg: {tool_msg}")
        
        # Execute tool
        if args is None:
            args = {}
        result = await tool.ainvoke(args)
        exec_msg = {"role": "tool", "tool_call_id": tool_call['id'], "content": result}
        messages.append(exec_msg)
        
        # Handle special tools
        if tool_name == 'terminate':
            parsed_result = self._parse_result(result)
            results.append({"tool_called": tool_name, "arguments": args, "result": parsed_result})
            push_message(HumanMessage(
                content=f"Task completed: Tool '{tool_name}' execution finished", 
                id=self._generate_record_id()
            ))
            return {"terminate": result}
        
        if tool_name == 'feedback':
            push_message(HumanMessage(
                content=f"Feedback received: Tool '{tool_name}' execution finished", 
                id=self._generate_record_id()
            ))
            return {"terminate": "failure"}
        
        # Handle normal tools
        if 'Exception' not in result and 'Error' not in result:
            parsed_result = self._parse_result(result)
            results.append({"tool_called": tool_name, "arguments": args, "result": parsed_result})
        
        logger.info(exec_msg)
        push_message(HumanMessage(
            content=f"Tool execution completed: '{tool_name}'", 
            id=self._generate_record_id()
        ))
        return None

    async def _action(self, think_res, tool_map: Dict, messages: List[Dict], 
                     results: List[Dict]) -> Dict | List[Dict]:
        """Execute actions based on tool calls from the thinking step."""
        tool_calls = think_res.invalid_tool_calls or think_res.tool_calls
        messages.append({
            "role": "assistant", 
            "content": think_res.content, 
            "tool_calls": tool_calls
        })
        
        for tool_call in tool_calls:
            try:
                termination = await self._execute_single_tool(tool_call, tool_map, messages, results)
                if termination:
                    return termination
            except Exception:
                err_msg = {
                    "role": "tool", 
                    "tool_call_id": tool_call['id'], 
                    "content": f"Error: {traceback.format_exc()}"
                }
                messages.append(err_msg)
        
        return results

    async def build_tools(self):
        tools = []
        if self.mcp_servers:
            mcp_client = MultiServerMCPClient(self.mcp_servers)
            tools.extend(await mcp_client.get_tools())
        tools.append(terminate)
        tools.append(feedback)
        tools.append(read_file_head3)
        tools.append(read_file_head20)
        return tools

    def _check_duplicate_response(self, think_signatures: List[str], 
                                   step_messages: List[Dict], 
                                   first_same_question: bool) -> Tuple[bool, bool]:
        """Check if the agent is generating duplicate responses."""
        if len(think_signatures) < 2 or think_signatures[-1] != think_signatures[-2]:
            return first_same_question, False
        
        logger.info("The same answer as before has been detected.")
        if first_same_question:
            step_messages.append({"role": "user", "content": SAME_ANSWER_PROMPT})
            return False, False
        return first_same_question, True

    async def _execute_agent_step(self, step_state: StepState, config: RunnableConfig):
        """Main execution loop for the agent."""
        if self.retrieve_info == 'None available' and self.current_step:
            try:
                retrieved_info = await self.retrieve_step_information(
                    step_title=self.current_step.title,
                    step_description=self.current_step.description,
                    config=config
                )
                if retrieved_info:
                    self.retrieve_info = retrieved_info
                    logger.info(f"RAG retrieval successful for step: {self.current_step.title}")
                else:
                    logger.warning(f"No RAG information retrieved for step: {self.current_step.title}")
            except Exception as e:
                logger.warning(f"RAG retrieval failed: {str(e)}. Using default retrieve_info.")
        
        llm = get_llm_by_name(self.react_llm)
        tool_map = {t.name: t for t in self.tools}

        input_ = {
            "messages": step_state['history'],
            "locale": step_state.get("locale"),
            "workspace_directory": self.workspace_directory
        }
        step_messages = apply_prompt_template("react_agent", input_)
        results: List[Dict] = []
        think_signatures: List[str] = []
        first_no_action = True
        no_action = False
        first_same_question = True
        
        for i in range(self.max_iterations):
            # Check for duplicate responses after first iteration
            if i > 0:
                first_same_question, should_terminate = self._check_duplicate_response(
                    think_signatures, step_messages, first_same_question
                )
                if should_terminate:
                    return {"terminate": "unknown"}, results
            
            # Think step
            with tag_scope(config, MessageTag.THINK):
                has_action, think_res = await self._think(
                    no_action, llm, self.tools, step_messages, self.retrieve_info, config
                )
            
            # Track thinking signatures for duplicate detection
            try:
                think_signatures.append(self._make_think_signature(think_res))
            except Exception:
                pass
            
            # Action step
            if has_action:
                first_no_action = True
                action_res = await self._action(
                    think_res=think_res, 
                    tool_map=tool_map, 
                    messages=step_messages, 
                    results=results
                )
                if isinstance(action_res, dict) and action_res.get("terminate") is not None:
                    return action_res, results
            else:
                # Handle no action case
                no_action = True
                if first_no_action:
                    push_message(HumanMessage(
                        content=f"Analysis result: {think_res.content}", 
                        id=self._generate_record_id()
                    ))
                    step_messages.pop()
                    first_no_action = False
                else:
                    break

        return {"terminate": "unknown"}, results

    @abstractmethod
    def run(self, state: StepState, config: RunnableConfig):
        """
        Execute the sub-agent's task.

        Args:
            state (StepState): The current execution state containing workspace
                              directory, current step, and other context information
            config (RunnableConfig): Configuration settings for the runnable execution
        """
        pass