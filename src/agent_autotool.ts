/**
 * agent_autotool.ts
 *
 * A Bee agent that can:
 *  - Use a Python code interpreter
 *  - Generate new custom tools (CreateCustomTool)
 *  - If developer mode=ON, rely on HumanTool for snippet refinements & final approval
 *  - Save the final snippet in library.json
 */

import "dotenv/config.js";
import { BeeAgent } from "bee-agent-framework/agents/bee/agent";
import { FrameworkError } from "bee-agent-framework/errors";
import * as process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UnconstrainedMemory } from "bee-agent-framework/memory/unconstrainedMemory";
import { LocalPythonStorage } from "bee-agent-framework/tools/python/storage";
import { PythonTool } from "bee-agent-framework/tools/python/python";
import { AnyTool } from "bee-agent-framework/tools/base";
import { GroqChatLLM } from "bee-agent-framework/adapters/groq/chat";
import { PromptTemplate } from "bee-agent-framework/template";
import { z } from "zod";

import { CreateCustomTool } from "./createCustomTool.js";
import { HumanTool } from "./humanTool.js";
import { FIRMWARE_SYSTEM_PROMPT } from "./firmwarePrompt.js";
import { getPrompt } from "./helpers/prompt.js";
import { createConsoleReader } from "./helpers/io.js";

// Just an example set of Bee prompts, or you can define your own
import {
  MySystemPrompt,
  MyAssistantPrompt,
  MyUserPrompt,
  MyToolErrorPrompt,
  MyToolInputErrorPrompt,
  MySchemaErrorPrompt,
} from "./prompts.js";

const codeInterpreterUrl = process.env.CODE_INTERPRETER_URL;
if (!codeInterpreterUrl) {
  throw new Error(`The 'CODE_INTERPRETER_URL' environment variable is required!`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1) We have a PythonTool
const pythonTool = new PythonTool({
  codeInterpreter: { url: codeInterpreterUrl },
  storage: new LocalPythonStorage({
    interpreterWorkingDir: `${__dirname}/../tmp/code_interpreter_target`,
    localWorkingDir: `${__dirname}/../tmp/code_interpreter_source`,
  }),
});

// 2) Create an array of base tools
const tools: AnyTool[] = [pythonTool];

// 3) Create a "HumanTool" for dev-mode scenario
const reader = createConsoleReader();
const humanTool = new HumanTool({ reader });
tools.push(humanTool);

// 4) Create the "CreateCustomTool" that can produce new custom tools
const createCustomTool = new CreateCustomTool({ url: codeInterpreterUrl }, tools);
tools.push(createCustomTool);

// 5) Merge the firmware with your system prompt
const combinedSystemPrompt = new PromptTemplate({
  schema: z.object({
    instructions: z.string().default("You are a helpful assistant."),
    tools: z.array(
      z
        .object({
          name: z.string().min(1),
          description: z.string().min(1),
          schema: z.string().min(1),
        })
        .passthrough(),
    ),
    createdAt: z.string().datetime().nullish(),
  }),
  // Get the template string from the original prompt's configuration
  template: `${FIRMWARE_SYSTEM_PROMPT}\n${(MySystemPrompt as any).config.template}`,
});

// 6) Construct the BeeAgent
const agent = new BeeAgent({
  llm: new GroqChatLLM(),
  memory: new UnconstrainedMemory(),
  tools,
  meta: {
    name: "Bee Auto-Tooling Agent",
    description:
      "Agent that can create custom tools on the fly and request human snippet approvals.",
  },
  templates: {
    system: combinedSystemPrompt,
    assistant: MyAssistantPrompt,
    user: MyUserPrompt,
    toolError: MyToolErrorPrompt,
    toolInputError: MyToolInputErrorPrompt,
    schemaError: MySchemaErrorPrompt,
  },
  execution: {
    maxIterations: 8,
    maxRetriesPerStep: 3,
    totalMaxRetries: 10,
  },
});

/**
 * Simple function to run a prompt through the agent
 */
async function runAgentWithPrompt(promptText: string) {
  console.info(`\nUser 👤 : ${promptText}`);
  try {
    const prompt = getPrompt(promptText);
    const response = await agent.run({ prompt }).observe((emitter) => {
      emitter.on("update", (data) => {
        console.info(`Agent 🤖 (${data.update.key}): ${data.update.value}`);
      });
    });

    console.info(`Agent 🤖 Final Answer: ${response.result.text}`);
  } catch (error) {
    console.error(FrameworkError.ensure(error).dump());
  }
}

// 7) Demo usage with two sample queries
await runAgentWithPrompt("Generate a random riddle.");
await runAgentWithPrompt(
  "Fetch a random riddle from 'https://riddles-api.vercel.app/random' endpoint.",
);

// End
process.exit(0);
