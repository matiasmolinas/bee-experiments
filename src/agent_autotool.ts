/**
 * agent_autotool.ts
 *
 * This agent can create new tools on the fly to satisfy user requests.
 * We include two prompts so you can see how it might build or reuse custom tools
 * for different random riddle tasks.
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

// The tool that can create new custom tools on the fly
import { CreateCustomTool } from "./createCustomTool.js";

// Import your custom prompt templates
import {
  MySystemPrompt,
  MyAssistantPrompt,
  MyUserPrompt,
  MyToolErrorPrompt,
  MyToolInputErrorPrompt,
  MySchemaErrorPrompt,
} from "./prompts.js";

// If you still have a helper function for user prompts:
import { getPrompt } from "./helpers/prompt.js";

/**
 * Validate environment
 */
const codeInterpreterUrl = process.env.CODE_INTERPRETER_URL;
if (!codeInterpreterUrl) {
  throw new Error(`The 'CODE_INTERPRETER_URL' environment variable was not set! Terminating.`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 1) Instantiate the base Python tool
 */
const pythonTool = new PythonTool({
  codeInterpreter: { url: codeInterpreterUrl },
  storage: new LocalPythonStorage({
    interpreterWorkingDir: `${__dirname}/../tmp/code_interpreter_target`,
    localWorkingDir: `${__dirname}/../tmp/code_interpreter_source`,
  }),
});

/**
 * 2) Create an array of tools (no pre-built custom tools this time)
 */
const tools: AnyTool[] = [pythonTool];

/**
 * 3) Instantiate the createCustomTool and push it into 'tools'
 */
const createCustomTool = new CreateCustomTool({ url: codeInterpreterUrl }, tools);
tools.push(createCustomTool);

/**
 * 4) Construct the BeeAgent
 */
const agent = new BeeAgent({
  llm: new GroqChatLLM(),
  memory: new UnconstrainedMemory(),
  tools,
  meta: {
    name: "Bee Auto-Tooling Agent",
    description: "Agent that can create custom tools on the fly if needed.",
  },
  templates: {
    system: MySystemPrompt,
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
 * 5) Demonstrate how the agent handles two different prompts.
 *    - The first prompt is the same "Generate a random riddle."
 *      from your original code_interpreter example.
 *    - The second prompt references the Vercel random riddle API,
 *      encouraging the agent to create a custom tool that calls it
 *      (similar to your original snippet).
 */
async function runAgentWithPrompt(promptText: string) {
  console.info(`\nUser 👤 : ${promptText}`);

  try {
    const prompt = getPrompt(promptText);
    const response = await agent
      .run(
        { prompt },
        {
          execution: {
            maxIterations: 8,
            maxRetriesPerStep: 3,
            totalMaxRetries: 10,
          },
        },
      )
      .observe((emitter) => {
        // Optionally log intermediate steps from the agent
        emitter.on("update", (data) => {
          console.info(`Agent 🤖 (${data.update.key}) : ${data.update.value}`);
        });
      });

    // Print final agent response
    console.info(`Agent 🤖 Final Answer: ${response.result.text}`);
  } catch (error) {
    console.error(FrameworkError.ensure(error).dump());
  }
}

//
// 6) Execute with two different prompts
//

// 6a) First prompt: the same original request
await runAgentWithPrompt("Generate a random riddle.");

// 6b) Second prompt: more explicit reference to the vercel riddle API
await runAgentWithPrompt(
  "Fetch a random riddle from the 'https://riddles-api.vercel.app/random' endpoint.",
);
