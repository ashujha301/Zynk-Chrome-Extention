import os
import re
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv
from app.schemas.action_schema import ActionPlan

load_dotenv()
logger = logging.getLogger(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# FAST-PATH MATCHER
# Exact matches — command must equal this exactly after normalisation
_EXACT: dict[str, list[dict]] = {
    "go back":         [{"action": "browser_back"}],
    "back":            [{"action": "browser_back"}],
    "go forward":      [{"action": "browser_forward"}],
    "forward":         [{"action": "browser_forward"}],
    "reload":          [{"action": "reload"}],
    "refresh":         [{"action": "reload"}],
    "refresh the page":[{"action": "reload"}],
    "reload the page": [{"action": "reload"}],
    "close tab":       [{"action": "close_tab"}],
    "close this tab":  [{"action": "close_tab"}],
    "new tab":         [{"action": "new_tab"}],
    "open new tab":    [{"action": "new_tab"}],
    "next tab":        [{"action": "next_tab"}],
    "previous tab":    [{"action": "prev_tab"}],
    "prev tab":        [{"action": "prev_tab"}],
    "scroll down":     [{"action": "scroll", "direction": "down", "amount": 500}],
    "scroll up":       [{"action": "scroll", "direction": "up",   "amount": 500}],
    "scroll to top":   [{"action": "scroll_to_edge", "edge": "top"}],
    "scroll to bottom":[{"action": "scroll_to_edge", "edge": "bottom"}],
    "go to top":       [{"action": "scroll_to_edge", "edge": "top"}],
    "go to bottom":    [{"action": "scroll_to_edge", "edge": "bottom"}],
    "top of page":     [{"action": "scroll_to_edge", "edge": "top"}],
    "bottom of page":  [{"action": "scroll_to_edge", "edge": "bottom"}],
    "zoom in":         [{"action": "zoom", "level": 1.25}],
    "zoom out":        [{"action": "zoom", "level": 0.75}],
    "reset zoom":      [{"action": "zoom", "level": 1.0}],
    "open google":     [{"action": "navigate", "url": "https://www.google.com"}],
    "open youtube":    [{"action": "navigate", "url": "https://www.youtube.com"}],
    "open gmail":      [{"action": "navigate", "url": "https://mail.google.com"}],
    "open github":     [{"action": "navigate", "url": "https://github.com"}],
    "open twitter":    [{"action": "navigate", "url": "https://twitter.com"}],
    "open instagram":  [{"action": "navigate", "url": "https://www.instagram.com"}],
    "open linkedin":   [{"action": "navigate", "url": "https://www.linkedin.com"}],
    "open reddit":     [{"action": "navigate", "url": "https://www.reddit.com"}],
    "open amazon":     [{"action": "navigate", "url": "https://www.amazon.com"}],
    "submit":          [{"action": "press_enter"}],
    "submit the form": [{"action": "press_enter"}],
    "press enter":     [{"action": "press_enter"}],
}

# Pattern matches — command must contain this substring
_PATTERNS: list[tuple[str, list[dict]]] = [
    ("scroll down a lot",  [{"action": "scroll", "direction": "down", "amount": 1200}]),
    ("scroll up a lot",    [{"action": "scroll", "direction": "up",   "amount": 1200}]),
    ("scroll down more",   [{"action": "scroll", "direction": "down", "amount": 1200}]),
    ("scroll up more",     [{"action": "scroll", "direction": "up",   "amount": 1200}]),
]


def _fast_path(command: str) -> list[dict] | None:
    """Return steps instantly if the command matches a known pattern, else None."""
    # Strip page context prefix before matching
    clean = re.sub(r'^\[Current page:[^\]]+\]\s*', '', command).lower().strip()
    clean = re.sub(r'[^\w\s]', '', clean).strip()

    if clean in _EXACT:
        logger.info("Fast-path match: '%s'", clean)
        return _EXACT[clean]

    for pattern, steps in _PATTERNS:
        if pattern in clean:
            logger.info("Fast-path pattern: '%s'", pattern)
            return steps

    return None



# SYSTEM PROMPT  — trimmed to ~1100 tokens (was ~2800)
# One example per action type. Page context instruction added.
# wait_for timeouts reduced to 2000ms.

SYSTEM_PROMPT = """
You are a browser automation agent controlling a real Chrome browser via voice.
Return ONLY valid JSON. No markdown, no explanation, no code blocks.

The user message may start with [Current page: URL]. Use it to pick correct selectors.

ACTIONS
-------
navigate        {"action":"navigate","url":"https://..."}
click_text      {"action":"click_text","text":"Sign in","contains":false}
click_selector  {"action":"click_selector","selector":"button[aria-label='Search']"}
type            {"action":"type","selector":"input[name='q']","text":"hello","clear":true}
press_enter     {"action":"press_enter","selector":"input[name='q']"}
scroll          {"action":"scroll","direction":"down","amount":500}
scroll_to_edge  {"action":"scroll_to_edge","edge":"top"}
wait_for        {"action":"wait_for","selector":"ytd-video-renderer","timeout_ms":2000}
find_text       {"action":"find_text","text":"privacy policy"}
browser_back    {"action":"browser_back"}
browser_forward {"action":"browser_forward"}
reload          {"action":"reload"}
new_tab         {"action":"new_tab","url":"https://google.com"}
close_tab       {"action":"close_tab"}
next_tab        {"action":"next_tab"}
prev_tab        {"action":"prev_tab"}
zoom            {"action":"zoom","level":1.25}

RULES
-----
- Build search URLs directly: google.com/search?q=X, youtube.com/results?search_query=X, amazon.com/s?k=X
- Use wait_for ONLY for slow dynamic pages. Default timeout_ms: 2000.
- Prefer id > aria-label > name > class for selectors.
- For back/forward/reload/close tab/new tab always use the dedicated action.
- Return ONLY the JSON object.

EXAMPLES
--------
"open youtube and play lofi music"
{"steps":[{"action":"navigate","url":"https://www.youtube.com/results?search_query=lofi+music"},{"action":"wait_for","selector":"ytd-video-renderer","timeout_ms":2000},{"action":"click_selector","selector":"ytd-video-renderer:first-child a#thumbnail"}]}

"search google for best python tutorials"
{"steps":[{"action":"navigate","url":"https://www.google.com/search?q=best+python+tutorials"}]}

"[Current page: https://www.google.com/search?q=test] click the first result"
{"steps":[{"action":"click_selector","selector":"h3.LC20lb"}]}

"[Current page: https://www.youtube.com] click the first video"
{"steps":[{"action":"click_selector","selector":"ytd-video-renderer:first-child a#thumbnail"}]}

"type hello world in the search box"
{"steps":[{"action":"type","selector":"input[type='search'],input[name='q']","text":"hello world","clear":true},{"action":"press_enter","selector":"input[type='search'],input[name='q']"}]}

"open amazon and search for wireless headphones"
{"steps":[{"action":"navigate","url":"https://www.amazon.com/s?k=wireless+headphones"}]}

"find privacy policy on this page"
{"steps":[{"action":"find_text","text":"privacy policy"}]}

"zoom to 150 percent"
{"steps":[{"action":"zoom","level":1.5}]}
"""

# MAIN ENTRY POINT

def generate_action_plan(command: str) -> dict:
    # 1. Try fast-path first — returns instantly for known commands
    fast = _fast_path(command)
    if fast is not None:
        return {"steps": fast}

    # 2. Fall through to LLM for complex / unknown commands
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        max_tokens=400,   # action plans are short — cap tokens to reduce latency
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": command}
        ],
    )

    content = response.choices[0].message.content.strip()

    # Strip accidental markdown fences
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    parsed      = json.loads(content)
    action_plan = ActionPlan(**parsed)

    clean_steps = [
        {k: v for k, v in step.dict().items() if v is not None}
        for step in action_plan.steps
    ]

    return {"steps": clean_steps}