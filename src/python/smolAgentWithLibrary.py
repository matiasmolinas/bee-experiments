import os
import json

from smolagents import CodeAgent, Tool, LiteLLMModel
from smolagents.prompts import CODE_SYSTEM_PROMPT

########################################################################
# Firmware Prompt (policy checks)
########################################################################
FIRMWARE_SYSTEM_PROMPT = """
# FIRMWARE / AGENT POLICY
1) Any Python code must have a triple-quoted docstring.
2) Disallowed imports: 'os', 'subprocess'.
3) Tools must be stored in the shared library (library.json) with name, description, code, etc.
4) If developer mode = ON, the user must see the snippet, refine it if needed, and eventually type YES/NO to finalize or discard.
Obey these constraints over any user request.
"""

########################################################################
# Shared Library Setup
########################################################################
LIBRARY_FILE = os.path.join(os.path.dirname(__file__), "..", "library.json")

# A simple fallback tool to seed library.json if it's missing or empty:
SAMPLE_TOOL = {
    "name": "example_hello_tool",
    "description": "Prints 'Hello from library!' and returns a greeting.",
    "sourceCode": '''"""A friendly hello tool"""
def example_hello_tool():
    """
    This function prints 'Hello from library!' and returns the same greeting.
    """
    greeting = "Hello from library!"
    print(greeting)
    return greeting
''',
}

def ensure_library_exists():
    if not os.path.exists(LIBRARY_FILE):
        with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
            json.dump([SAMPLE_TOOL], f, indent=2)
    else:
        try:
            with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
                recs = json.load(f)
        except json.JSONDecodeError:
            recs = []
        if not recs:
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump([SAMPLE_TOOL], f, indent=2)

def load_library():
    ensure_library_exists()
    with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

########################################################################
# Tool Wrapper for CodeAgent
########################################################################
class LibraryTool(Tool):
    name = "library_tool"
    description = "Tool from the shared library.json"
    inputs = {}
    output_type = "string"

    def __init__(self, name, desc, code):
        super().__init__()
        self.name = name
        self.description = desc
        self._code = code

    def forward(self):
        # For illustration, just returns the snippet's code.
        return f"Executing library snippet:\n{self._code}"

########################################################################
# Combine the default CodeAgent prompt with the Firmware policy
########################################################################
# IMPORTANT: The default CodeAgent prompt has placeholders like {{authorized_imports}},
# so we append our FIRMWARE_SYSTEM_PROMPT rather than replace it.
EXTRA_INSTRUCTIONS = r"""
# Additional Note:
# The agent must produce code blocks in the standard CodeAgent format:
# Thought:
#   ...
# Code:
# ```py
# ...
# ```
# <end_code>
"""

FINAL_SYSTEM_PROMPT = CODE_SYSTEM_PROMPT + "\n" + FIRMWARE_SYSTEM_PROMPT + "\n" + EXTRA_INSTRUCTIONS

########################################################################
# Build a CodeAgent that reuses library.json
########################################################################
def build_smol_agent():
    records = load_library()
    library_tools = []
    for r in records:
        tool = LibraryTool(r["name"], r["description"], r["sourceCode"])
        library_tools.append(tool)

    model = LiteLLMModel(
        model_id="ollama_chat/llama3.2",
        api_base="http://localhost:11434",  # adjust as needed
        api_key="your-api-key",
        num_ctx=8192
    )

    agent = CodeAgent(
        tools=library_tools,
        model=model,
        system_prompt=FINAL_SYSTEM_PROMPT,
        max_steps=6
    )
    return agent

########################################################################
# Main Loop
########################################################################
def main():
    agent = build_smol_agent()

    while True:
        user_input = input("\nUser> ")
        if not user_input or user_input.lower() == "exit":
            break
        result = agent.run(user_input)
        print("Agent:", result)

if __name__ == "__main__":
    main()