import os
from typing import Dict, Any

import yaml


def replace_env_vars(value: str) -> str:
    """
    Replace environment variable placeholders with their actual values.

    Args:
        value: String that may contain environment variable reference (e.g., "$VAR_NAME")

    Returns:
        Environment variable value if found, otherwise returns the original value
    """
    if not isinstance(value, str):
        return value

    if value.startswith("$"):
        env_var_name = value[1:]
        return os.getenv(env_var_name, value)

    return value


def process_dict(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively traverse configuration dictionary and replace all environment variables.

    Args:
        config: Configuration dictionary to process

    Returns:
        Processed configuration with environment variables replaced
    """
    result = {}

    for key, value in config.items():
        if isinstance(value, dict):
            result[key] = process_dict(value)
        elif isinstance(value, list):
            result[key] = [
                process_dict(item) if isinstance(item, dict)
                else replace_env_vars(item) if isinstance(item, str)
                else item
                for item in value
            ]
        elif isinstance(value, str):
            result[key] = replace_env_vars(value)
        else:
            result[key] = value

    return result


_config_cache: Dict[str, Dict[str, Any]] = {}


def load_yaml_config(file_path: str) -> Dict[str, Any]:
    """
    Load YAML configuration file with environment variable substitution and caching.

    Args:
        file_path: Path to the YAML configuration file

    Returns:
        Processed configuration dictionary, or empty dict if file doesn't exist
    """
    if not os.path.exists(file_path):
        return {}

    if file_path in _config_cache:
        return _config_cache[file_path]

    with open(file_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    processed_config = process_dict(config)
    _config_cache[file_path] = processed_config

    return processed_config