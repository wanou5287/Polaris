"""
Tag Manager for controlling message visibility in streaming responses.

This module provides centralized tag management for filtering LLM output
that should not be displayed to the frontend (e.g., internal thinking, planning).
"""

from contextlib import contextmanager
from enum import Enum
from typing import List, Set
from langchain_core.runnables import RunnableConfig


class MessageTag(str, Enum):
    """
    Enumeration of message tags for filtering streaming responses.
    
    Tags marked as "hidden" will be filtered out in server.py and not sent to frontend.
    """
    # Hidden tags (internal processing, not shown to users)
    THINK = "think"           # Agent thinking/reasoning process
    PLANNING = "planning"     # Planning phase
    REPLAN = "replan"         # Replanning phase
    SUMMARY = "summary"       # Internal summarization
    VALIDATION = "validation" # Validation checks
    
    # Visible tags (shown to users)
    NORMAL = ""              # Normal messages (default, shown to users)
    INFO = "info"            # Information messages
    ERROR = "error"          # Error messages
    

class TagFilter:
    """Centralized tag filtering configuration."""
    
    # Tags that should be hidden from frontend
    HIDDEN_TAGS: Set[str] = {
        MessageTag.THINK,
        MessageTag.PLANNING,
        MessageTag.REPLAN,
        MessageTag.SUMMARY,
        MessageTag.VALIDATION,
    }
    
    @classmethod
    def should_hide(cls, tags: List[str] | None) -> bool:
        """
        Determine if a message with given tags should be hidden from frontend.
        
        Args:
            tags: List of tags associated with a message
            
        Returns:
            True if message should be hidden, False otherwise
        """
        if tags is None:
            return False
        return any(tag in cls.HIDDEN_TAGS for tag in tags)
    
    @classmethod
    def add_hidden_tag(cls, tag: str):
        """Add a custom tag to the hidden tags set."""
        cls.HIDDEN_TAGS.add(tag)
    
    @classmethod
    def remove_hidden_tag(cls, tag: str):
        """Remove a tag from the hidden tags set."""
        cls.HIDDEN_TAGS.discard(tag)


@contextmanager
def tag_scope(config: RunnableConfig, tag: MessageTag | str):
    """
    Context manager for temporarily setting a tag on config.
    
    Automatically resets the tag to NORMAL when exiting the context.
    This prevents forgetting to reset tags manually.
    
    Args:
        config: The RunnableConfig to modify
        tag: The tag to set (can be MessageTag enum or string)
        
    Example:
        >>> with tag_scope(config, MessageTag.THINK):
        ...     # Code here will have 'think' tag
        ...     result = await llm.ainvoke(messages)
        >>> # Tag is automatically reset to '' here
    """
    original_tags = config.get('tags', [MessageTag.NORMAL])
    try:
        # Set the new tag
        tag_value = tag.value if isinstance(tag, MessageTag) else tag
        config['tags'] = [tag_value]
        yield config
    finally:
        # Always restore original tags
        config['tags'] = original_tags


def set_tag(config: RunnableConfig, tag: MessageTag | str):
    """
    Set a tag on the config.
    
    Args:
        config: The RunnableConfig to modify
        tag: The tag to set (can be MessageTag enum or string)
    """
    tag_value = tag.value if isinstance(tag, MessageTag) else tag
    config['tags'] = [tag_value]


def reset_tag(config: RunnableConfig):
    """
    Reset the tag to NORMAL (empty string).
    
    Args:
        config: The RunnableConfig to modify
    """
    config['tags'] = [MessageTag.NORMAL]


def get_current_tags(config: RunnableConfig) -> List[str]:
    """
    Get the current tags from config.
    
    Args:
        config: The RunnableConfig to read from
        
    Returns:
        List of current tags
    """
    return config.get('tags', [MessageTag.NORMAL])

