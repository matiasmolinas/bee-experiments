# python/smolAgentWithLibrary.py
import os, json
from smolagents import CodeAgent, Tool
from smolagents.utils import AgentLogger, LogLevel

LIBRARY_FILE = os.path.join(os.path.dirname(__file__), "..", "library.json")

FIRMWARE_SYSTEM_PROMPT = """
# SMOL FIRMWARE
1) Must have triple-quoted docstring
2) No 'os' or 'subprocess'
3) Tools come from library.json
"""

def load_library():
    if not os.path.exists(LIBRARY_FILE):
        return []
    with open(LIBRARY_FILE, "r") as f:
        return json.load(f)

class LibraryTool(Tool):
    name = "library_tool"
    description = "Tool from shared library"
    inputs = {}
    output_type = "string"

    def __init__(self, name, desc, code):
        super().__init__()
        self.name = name
        self.description = desc
        self._code = code

    def forward(self):
        return f"Executing library snippet:\n{self._code}"

def build_smol_agent():
    recs = load_library()
    library_tools = []
    for r in recs:
        t = LibraryTool(r["name"], r["description"], r["sourceCode"])
        library_tools.append(t)

    agent = CodeAgent(
        tools=library_tools,  # reusing the same library
        system_prompt=FIRMWARE_SYSTEM_PROMPT,
        max_steps=6,
        verbosity_level=LogLevel.INFO,
    )
    return agent

def main():
    a = build_smol_agent()
    while True:
        user = input("\nUser> ")
        if not user or user.lower() == "exit":
            break
        result = a.run(user)
        print("Agent:", result)

if __name__ == "__main__":
    main()
