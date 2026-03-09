from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class ActionType(str, Enum): 
    # Page interaction
    navigate        = "navigate"
    click_text      = "click_text"
    click_selector  = "click_selector"
    type            = "type"
    press_enter     = "press_enter"
    scroll          = "scroll"
    scroll_to_edge  = "scroll_to_edge"
    wait_for        = "wait_for"
    find_text       = "find_text"
    # Browser / tab control
    browser_back    = "browser_back"
    browser_forward = "browser_forward"
    reload          = "reload"
    new_tab         = "new_tab"
    close_tab       = "close_tab"
    next_tab        = "next_tab"
    prev_tab        = "prev_tab"
    zoom            = "zoom"


class ActionStep(BaseModel):
    action: ActionType

    # navigate / new_tab
    url: Optional[str] = None

    # click_text / find_text
    text: Optional[str] = None
    contains: Optional[bool] = None

    # click_selector / type / press_enter / wait_for
    selector: Optional[str] = None

    # type
    clear: Optional[bool] = None

    # scroll
    direction: Optional[Literal["up", "down"]] = None
    amount: Optional[int] = None

    # scroll_to_edge
    edge: Optional[Literal["top", "bottom"]] = None

    # zoom
    level: Optional[float] = None  # e.g. 1.0 = 100%, 1.5 = 150%, 0.8 = 80%

    # wait_for
    timeout_ms: Optional[int] = None


class ActionPlan(BaseModel):
    steps: list[ActionStep]