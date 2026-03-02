import os
import json
from openai import OpenAI
from dotenv import load_dotenv
from app.schemas.action_schema import ActionPlan

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """
You are a browser automation agent.

You MUST return ONLY valid JSON.

Allowed actions:

1. navigate → requires "url"
   - Use full valid URLs.
   - For search, generate proper search URLs.
   - Example:
     https://www.youtube.com/results?search_query=dua+lipa

2. click_text → requires "text"
   - Click visible text exactly as shown on page.

3. scroll → requires "direction"
   - "up" or "down"

Return strictly this format:

{
  "steps": [
    {
      "action": "navigate",
      "url": "https://example.com"
    }
  ]
}

Rules:
- Do NOT explain.
- Do NOT add markdown.
- Do NOT wrap in code block.
- Only raw JSON.
"""


def generate_action_plan(command: str) -> ActionPlan:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": command}
        ],
    )

    content = response.choices[0].message.content.strip()

    # Parse JSON safely
    parsed = json.loads(content)

    # Validate schema strictly
    action_plan = ActionPlan(**parsed)

    # Remove None fields before returning
    clean_steps = [
        {k: v for k, v in step.dict().items() if v is not None}
        for step in action_plan.steps
    ]   

    return {"steps": clean_steps}