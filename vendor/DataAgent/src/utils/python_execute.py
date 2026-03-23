import ast
import multiprocessing
import sys
import traceback
from io import StringIO
from typing import Dict

from langchain_core.tools import tool


def _run_code(code: str, result_dict: dict, safe_globals: dict) -> None:
    original_stdout = sys.stdout
    try:
        # Lightweight AST-based safety checks (non-breaking for common data tasks)
        # - Disallow direct use of eval/exec/compile/__import__
        # - Disallow importing subprocess/socket
        # - Disallow calling os.system
        class _SafetyVisitor(ast.NodeVisitor):
            _blocked_builtin_calls = {"eval", "exec", "compile", "__import__"}
            _blocked_imports = {"subprocess", "socket"}

            def visit_Import(self, node: ast.Import) -> None:
                for alias in node.names:
                    if alias.name.split(".")[0] in self._blocked_imports:
                        raise ValueError(f"Import of '{alias.name}' is not allowed")
                self.generic_visit(node)

            def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
                if node.module and node.module.split(".")[0] in self._blocked_imports:
                    raise ValueError(f"Import from '{node.module}' is not allowed")
                self.generic_visit(node)

            def visit_Call(self, node: ast.Call) -> None:
                # Block direct builtin calls like eval/exec/compile/__import__
                func = node.func
                if isinstance(func, ast.Name) and func.id in self._blocked_builtin_calls:
                    raise ValueError(f"Call to '{func.id}' is not allowed")
                # Block os.system(...)
                if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
                    if func.value.id == "os" and func.attr == "system":
                        raise ValueError("Call to 'os.system' is not allowed")
                self.generic_visit(node)

        # Parse and validate user code first (won't alter normal imports/usages)
        try:
            _SafetyVisitor().visit(ast.parse(code))
        except Exception:
            # Surface clear error to caller while preserving return shape (string observation)
            raise

        output_buffer = StringIO()
        sys.stdout = output_buffer

        # Detect and modify pandas import statements
        if "import pandas as pd" in code:
            # Add pandas display options configuration after import pandas as pd
            pandas_config = """
pd.set_option('display.float_format', '{:.2f}'.format)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
pd.set_option('display.max_colwidth', None)"""

            # Split code by lines
            lines = code.split('\n')
            modified_lines = []

            for line in lines:
                modified_lines.append(line)
                # If this line contains import pandas as pd, add configuration after it
                if 'import pandas as pd' in line and not line.strip().startswith('#'):
                    modified_lines.append(pandas_config)

            code = '\n'.join(modified_lines)

        # Execute code
        exec(code, safe_globals)

        # Analyze the last statement of the code
        try:
            tree = ast.parse(code)
            if tree.body:
                last_node = tree.body[-1]

                # If it's an expression statement, analyze different types of expressions
                if isinstance(last_node, ast.Expr):
                    # Single variable name
                    if isinstance(last_node.value, ast.Name):
                        var_name = last_node.value.id
                        if var_name in safe_globals:
                            var_value = safe_globals[var_name]
                            print(var_value)

                    # Tuple literal, e.g. (a, b)
                    elif isinstance(last_node.value, ast.Tuple):
                        # Get values of all variables in the tuple
                        tuple_values = []
                        for element in last_node.value.elts:
                            if isinstance(element, ast.Name) and element.id in safe_globals:
                                tuple_values.append(safe_globals[element.id])
                        if tuple_values:
                            print(tuple(tuple_values))
                    else:
                        if isinstance(last_node.value, ast.Call) and isinstance(last_node.value.func,
                                                                                ast.Name) and last_node.value.func.id == 'print':
                            # Last statement is a print statement, no need for additional printing
                            pass
                        else:
                            try:
                                # Try to evaluate the expression value
                                expr_code = ast.unparse(last_node.value)
                                local_env = safe_globals.copy()
                                exec(f"temp_result = {expr_code}", local_env)
                                result_value = local_env.get("temp_result")
                                if result_value is not None:
                                    print(result_value)
                            except:
                                # If unable to evaluate, skip
                                pass

        except SyntaxError:
            # If code has syntax error, skip AST analysis
            pass

        result_dict["observation"] = output_buffer.getvalue()
        result_dict["success"] = True
    except Exception as e:
        error_msg = traceback.format_exc()
        result_dict[
            "observation"] = f"Exception occurred while executing code. Exception log: {error_msg}. "
        result_dict["success"] = False
    finally:
        sys.stdout = original_stdout


async def execute(
        code: str,
        timeout: int = 300,
) -> Dict:
    """
    Executes the provided Python code with a timeout.

    Args:
        code (str): The Python code to execute.
        timeout (int): Execution timeout in seconds.

    Returns:
        Dict: Contains 'output' with execution output or error message and 'success' status.
    """

    with multiprocessing.Manager() as manager:
        result = manager.dict({"observation": "", "success": False})
        if isinstance(__builtins__, dict):
            safe_globals = {"__builtins__": __builtins__}
        else:
            safe_globals = {"__builtins__": __builtins__.__dict__.copy()}
        proc = multiprocessing.Process(
            target=_run_code, args=(code, result, safe_globals)
        )
        proc.start()
        proc.join(timeout)

        # timeout process
        if proc.is_alive():
            proc.terminate()
            proc.join(1)
            return f"Exception occurred while executing code. Specific exception: Execution timeout after {timeout} seconds"
        return result.get("observation", "")

@tool
async def run_python_code(code: str):
    """A tool for executing Python code with timeout and safety restrictions.
    * Must process only real data from actual sources. PROHIBITED: Creating lists/dicts/DataFrames with hardcoded business values like sales=[1000,2000] or data={'platform':['Amazon'],'sales':[5000]}. Data must be from: tool responses, variables in context, or file reads.
    * NEVER use comments suggesting fake data: "simulated data", "assumed", "sample data", "for demonstration", "in actual application should get from tool", "mock data".
    * When using df.head() for output display, limit to maximum 10 rows: use df.head(10).
    * Keep the code concise.
    * Do not add analytical conclusions: "report", "analysis summary"

    Args:
        code (str): The Python code to execute.
    """
    return await execute(code)
