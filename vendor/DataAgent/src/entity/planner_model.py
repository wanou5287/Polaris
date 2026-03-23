from typing import List, Optional

from pydantic import BaseModel, Field


class Step(BaseModel):
    title: str
    description: str = Field(..., description="Specify exactly what data to collect")
    agent: str = Field(..., description="Which agent should be called?")
    execution_res: Optional[str] = Field(
        default="", description="The Step execution result"
    )
    summary_execution_res: Optional[str] = Field(
        default="", description="The Step summary execution result"
    )
    final_status: str = "unknown"

class Question(BaseModel):
    question: str = Field(..., description="Clear, concise question for user confirmation")

class Response(BaseModel):
    """Response to user."""
    response: str

class Plan(BaseModel):
    locale: str = Field(
        ..., description="e.g. 'en-US' or 'zh-CN', based on the user's language"
    )
    thought: str
    title: str
    steps: List[Step] = Field(
        default_factory=list,
        description="Processing steps to get more context",
    )
    questions: List[Question] = Field(
        default_factory=list,
        description="0-3 clarification questions for user confirmation (empty array if none needed)",
    )