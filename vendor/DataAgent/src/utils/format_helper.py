"""Format helper utilities for consistent formatting across agents"""
import json
from typing import Any


def get_status_emoji(status: str) -> str:
    """
    Get emoji representation for a step status
    
    Args:
        status: Step status ('success', 'failure', or other)
        
    Returns:
        Emoji string representing the status
    """
    status_map = {
        "success": "✅",
        "failure": "❌"
    }
    return status_map.get(status, "⬜")


def to_text(data: Any) -> str:
    """
    Convert any data type to text representation
    
    Args:
        data: Data to convert (can be string, dict, list, etc.)
        
    Returns:
        String representation of the data
    """
    if isinstance(data, str):
        return data
    
    try:
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception:
        return str(data)


def format_step_result(step) -> dict:
    """
    Format a step's execution result with status emoji
    
    Args:
        step: Step object with description, agent, status, and execution results
        
    Returns:
        Dictionary with formatted step information
    """
    status_emoji = get_status_emoji(step.final_status)
    result = step.summary_execution_res if step.summary_execution_res else step.execution_res
    
    return {
        "Task": f"{status_emoji} {step.description}",
        "Agent": step.agent,
        "Execution Result": result
    }

