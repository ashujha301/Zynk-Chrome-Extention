from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class ActionType(str, Enum):
    navigate       = "navigate"
    click_text     = "click_text"
    click_selector = "click_selector"
    type           = "type"
    press_enter    = "press_enter"
    scroll         = "scroll"
    wait_for       = "wait_for"


class ActionStep(BaseModel):
    action: ActionType

    # navigate
    url: Optional[str] = None

    # click_text
    text: Optional[str] = None
    contains: Optional[bool] = None

    # click_selector / type / press_enter / wait_for
    selector: Optional[str] = None

    # type
    clear: Optional[bool] = None

    # scroll
    direction: Optional[Literal["up", "down"]] = None
    amount: Optional[int] = None

    # wait_for
    timeout_ms: Optional[int] = None


class ActionPlan(BaseModel):
    steps: list[ActionStep]