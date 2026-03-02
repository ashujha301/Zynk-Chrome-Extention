from pydantic import BaseModel
from typing import List, Literal, Optional


class Action(BaseModel):
    action: Literal["navigate", "click_text", "scroll"]

    # required for navigate
    url: Optional[str] = None

    # required for click_text
    text: Optional[str] = None

    # required for scroll
    direction: Optional[Literal["up", "down"]] = None


class ActionPlan(BaseModel):
    steps: List[Action]