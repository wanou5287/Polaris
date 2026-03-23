import json
import logging
import os
import platform
from pathlib import Path
from typing import Optional, Literal

from langchain_core.tools import tool

from src.config.loader import load_yaml_config

logger = logging.getLogger(__name__)

# Limit the data size for single read operation (in bytes), can be overridden by environment variable READ_FILE_MAX_BYTES
_DEFAULT_MAX_BYTES = 32768  # 32 KB
try:
    _MAX_RETURN_BYTES = int(os.environ.get('READ_FILE_MAX_BYTES', str(_DEFAULT_MAX_BYTES)))
except Exception:
    _MAX_RETURN_BYTES = _DEFAULT_MAX_BYTES


def _ensure_within_limit_by_bytes(text: str, *, context: str) -> None:
    """Raise an exception if the text exceeds the limit when encoded in UTF-8."""
    if text is None:
        return
    if len(text.encode('utf-8', errors='ignore')) > _MAX_RETURN_BYTES:
        raise ValueError(f"Read result is too large, exceeding token limit")


@tool
def ask_user(question: str):
    """Ask the user for information needed to continue analysis.

    Args:
        question (str): Clear question describing what information is needed and why
    """
    return


@tool
def feedback(issue: str):
    """Report issues when required data cannot be obtained or conditions cannot be met during analysis execution

    Args:
        issue (str): A clear description of the encountered issue or obstacle
    """
    return


@tool
def terminate(status: str):
    """When you have finished the step, call this tool to end the work.

    Args:
        status (str): The finish status of the step. ["success", "failure"]
    """
    content = f"The step has been completed with status: {str(status)}"
    logger.info(content)
    return content


@tool
def read_file_head3(file_path: str):
    """
    Read the first 3 lines of a file

    Args:
        file_path (str): File path

    Returns:
        str: First 3 lines of the file
    """
    return read_file(file_path, "head", 3)


@tool
def read_file_head20(file_path: str):
    """
    Read the first 20 lines of a file

    Args:
        file_path (str): File path

    Returns:
        str: First 20 lines of the file
    """
    return read_file(file_path, "head", 20)


@tool
def list_available_csv_files() -> str:
    """
    List all available CSV files.

    Returns:
        str: JSON string containing array of CSV file information
    """
    try:
        # Load configuration
        config = load_yaml_config("conf.yaml")
        app_conf = config.get("app", {}) or {}
        csv_conf = app_conf.get("csv_data_directory", {}) or {}
        
        # Get CSV directory based on OS
        system = platform.system()
        key = "windows" if system == "Windows" else "linux"
        base_dir = csv_conf.get(key)
        
        if not base_dir:
            return json.dumps({
                "error": "CSV data directory not configured in conf.yaml",
                "files": []
            }, ensure_ascii=False, indent=2)
        
        if not os.path.isdir(base_dir):
            return json.dumps({
                "error": f"CSV data directory does not exist: {base_dir}",
                "files": []
            }, ensure_ascii=False, indent=2)
        
        # Scan directory for CSV files
        path = Path(base_dir)
        csv_files = list(path.glob('*.csv'))
        
        files_info = []
        for file_path in csv_files:
            try:
                # Get basic file info
                file_info = {
                    "file_name": file_path.name,
                    "file_path": str(file_path).replace('\\', '/'),
                    "columns": []
                }
                
                # Try to read CSV to get column info
                try:
                    import pandas as pd
                    # Try different separators
                    separators = ['^', ',', '\t']
                    df_header = None
                    separator = None
                    for sep in separators:
                        try:
                            df_header = pd.read_csv(file_path, sep=sep, nrows=0)  # Only read header
                            if len(df_header.columns) > 1:
                                separator = sep
                                break
                        except:
                            continue
                    
                    if df_header is not None and len(df_header.columns) > 1:
                        file_info["columns"] = [{"name": col, "dtype": str(df_header[col].dtype)} for col in df_header.columns]
                except Exception as e:
                    logger.warning(f"Failed to analyze CSV file {file_path}: {e}")
                    # Still include file info even if analysis fails
                
                files_info.append(file_info)
            except Exception as e:
                logger.warning(f"Failed to process file {file_path}: {e}")
                continue
        
        return json.dumps({
            "directory": str(base_dir).replace('\\', '/'),
            "files": files_info
        }, ensure_ascii=False, indent=2)
        
    except Exception as e:
        logger.error(f"Failed to list CSV files: {e}", exc_info=True)
        return json.dumps({
            "error": f"Failed to list CSV files: {str(e)}",
            "files": []
        }, ensure_ascii=False, indent=2)


def read_file(
        file_path: str,
        mode: Literal["all", "head", "tail"] = "all",
        n_lines: Optional[int] = None
) -> str:
    """
    Read file content
    * Avoid reading large files that produce excessive output.

    Args:
        file_path (str): File path
        mode (str): Read mode, options:
            - "all": Read entire file (default)
            - "head": Read first N lines
            - "tail": Read last N lines
        n_lines (int, optional): Number of lines to read when mode is "head" or "tail"

    Returns:
        str: File content or error message
    """
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return f"Error: File '{file_path}' does not exist"

        # Check if it is a file
        if not os.path.isfile(file_path):
            return f"Error: '{file_path}' is not a file"

        # Read file
        with open(file_path, 'r', encoding='utf-8') as f:
            if mode == "all":
                # Read entire file
                try:
                    # Prioritize file size limit to avoid loading large files entirely into memory
                    file_size = os.path.getsize(file_path)
                    if file_size > _MAX_RETURN_BYTES:
                        raise ValueError(f"Read result is too large, exceeding token limit")
                except Exception:
                    # If getting file size fails, ignore the error here and check content size later
                    pass

                content = f.read()
                _ensure_within_limit_by_bytes(content, context=f"all:{file_path}")
                return content

            elif mode == "head":
                # Read first N lines
                if n_lines is None:
                    return "Error: n_lines parameter must be specified when using head mode"

                lines = []
                for i, line in enumerate(f):
                    if i >= n_lines:
                        break
                    lines.append(line)
                content = ''.join(lines)
                _ensure_within_limit_by_bytes(content, context=f"head(n={n_lines}):{file_path}")
                return content

            elif mode == "tail":
                # Read last N lines
                if n_lines is None:
                    return "Error: n_lines parameter must be specified when using tail mode"

                # Read all lines and keep last N lines
                all_lines = f.readlines()
                tail_lines = all_lines[-n_lines:] if len(all_lines) >= n_lines else all_lines
                content = ''.join(tail_lines)
                _ensure_within_limit_by_bytes(content, context=f"tail(n={n_lines}):{file_path}")
                return content

            else:
                return f"Error: Unsupported mode '{mode}', please use 'all', 'head' or 'tail'"

    except UnicodeDecodeError:
        # If UTF-8 decoding fails, try other encodings
        try:
            with open(file_path, 'r', encoding='gbk') as f:
                if mode == "all":
                    content = f.read()
                    _ensure_within_limit_by_bytes(content, context=f"all(gbk):{file_path}")
                    return content
                elif mode == "head":
                    content = ''.join([f.readline() for _ in range(n_lines or 0)])
                    _ensure_within_limit_by_bytes(content, context=f"head(gbk,n={n_lines}):{file_path}")
                    return content
                elif mode == "tail":
                    all_lines = f.readlines()
                    content = ''.join(all_lines[-n_lines:] if len(all_lines) >= n_lines else all_lines)
                    _ensure_within_limit_by_bytes(content, context=f"tail(gbk,n={n_lines}):{file_path}")
                    return content
                return f"Error: Unsupported mode '{mode}', please use 'all', 'head' or 'tail'"
        except Exception as e:
            return f"Error: Unable to read file, encoding issue - {str(e)}"

    except Exception as e:
        return f"Error: Exception occurred while reading file - {str(e)}"

