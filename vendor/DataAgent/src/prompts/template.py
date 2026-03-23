import os
from datetime import datetime, timedelta

from jinja2 import Environment, FileSystemLoader, select_autoescape
from langgraph.graph import MessagesState

# Initialize Jinja2 environment
env = Environment(
    loader=FileSystemLoader(os.path.dirname(__file__)),
    autoescape=select_autoescape(),
    trim_blocks=True,
    lstrip_blocks=True,
)

def get_prompt_without_render(prompt_name: str) -> str:
    current_dir = os.path.dirname(__file__)
    prompt_path = os.path.normpath(os.path.join(current_dir, f"{prompt_name}.md"))
    with open(prompt_path, 'r', encoding='utf-8') as file:
        prompt_content = file.read()

    return prompt_content

def get_prompt_template(prompt_name: str) -> str:
    """
    Load and return a prompt template using Jinja2.

    Args:
        prompt_name: Name of the prompt template file (without .md extension)

    Returns:
        The template string with proper variable substitution syntax
    """
    try:
        template = env.get_template(f"{prompt_name}.md")
        return template.render()
    except Exception as e:
        raise ValueError(f"Error loading template {prompt_name}: {e}")


def apply_prompt_template(
    prompt_name: str, state: MessagesState
) -> list:
    """
    Apply template variables to a prompt template and return formatted messages.

    Args:
        prompt_name: Name of the prompt template to use
        state: Current agent state containing variables to substitute

    Returns:
        List of messages with the system prompt as the first message
    """
    # Convert state to dict for template rendering
    month_str = datetime.now().strftime("%m").lstrip('0')
    now = datetime.now()

    # week
    current_week_start = now - timedelta(days=now.weekday())
    current_week_end = current_week_start + timedelta(days=6)

    # month
    current_month_start = datetime(now.year, now.month, 1)
    next_month = current_month_start.replace(day=28) + timedelta(days=4)
    current_month_end = next_month - timedelta(days=next_month.day)

    # year
    current_year_start = datetime(now.year, 1, 1)
    current_year_end = datetime(now.year, 12, 31)

    state_vars = {
        "CURRENT_DAY": now.strftime("%Y-%m-%d"),
        "CURRENT_DAY_START": now.strftime("%Y-%m-%d"),
        "CURRENT_DAY_END": now.strftime("%Y-%m-%d"),

        "CURRENT_WEEK": f"{now.isocalendar()[0]}年第{now.isocalendar()[1]}周",
        "CURRENT_WEEK_START": current_week_start.strftime("%Y-%m-%d"),
        "CURRENT_WEEK_END": current_week_end.strftime("%Y-%m-%d"),

        "CURRENT_MONTH": f"{now.strftime('%Y')}年{month_str}月",
        "CURRENT_MONTH_START": current_month_start.strftime("%Y-%m-%d"),
        "CURRENT_MONTH_END": current_month_end.strftime("%Y-%m-%d"),

        "CURRENT_YEAR": f"{now.year}年",
        "CURRENT_YEAR_START": current_year_start.strftime("%Y-%m-%d"),
        "CURRENT_YEAR_END": current_year_end.strftime("%Y-%m-%d"),

        **state,
    }

    try:
        template = env.get_template(f"{prompt_name}.md")
        system_prompt = template.render(**state_vars)
        return [{"role": "system", "content": system_prompt}] + state["messages"]
    except Exception as e:
        raise ValueError(f"Error applying template {prompt_name}: {e}")
