import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


SYSTEM_PROMPT = """
You are a browser automation agent.

Convert user commands into structured JSON action steps.

Allowed actions:
1. open_tab(url)
2. search(site, query)
3. click_text(text)
4. scroll(direction)

Return ONLY valid JSON like:

{
  "steps": [
    {"action": "open_tab", "url": "..."}
  ]
}
"""


def generate_action_plan(command: str):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": command}
        ],
        temperature=0,
    )

    return response.choices[0].message.content