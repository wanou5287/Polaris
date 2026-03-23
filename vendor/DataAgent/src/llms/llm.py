from pathlib import Path
from typing import Any, Dict

from langchain_openai import ChatOpenAI

from src.config.loader import load_yaml_config

# Cache for LLM instances
_llm_cache: dict[str, ChatOpenAI] = {}


def _initial_llm(name: str, conf: Dict[str, Any]) -> ChatOpenAI:
    llm_conf = conf.get("llm", {}).get(name)
    if not llm_conf:
        raise ValueError(f"Unknown LLM: {name}")
    if not isinstance(llm_conf, dict):
        raise ValueError(f"Invalid LLM: {name}")
    llm_conf["timeout"] = 120
    return ChatOpenAI(**llm_conf)


def get_llm_by_name(
    name: str,
) -> ChatOpenAI:
    """
    Get LLM instance by name. Returns cached instance if available.
    """
    if name in _llm_cache:
        return _llm_cache[name]

    conf = load_yaml_config(
        str((Path(__file__).parent.parent.parent / "conf.yaml").resolve())
    )
    llm = _initial_llm(name, conf)
    _llm_cache[name] = llm
    return llm