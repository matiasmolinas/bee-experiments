// humanTool.ts
import { Emitter } from "bee-agent-framework/emitter/emitter";
import {
  Tool,
  BaseToolOptions,
  BaseToolRunOptions,
  JSONToolOutput,
  ToolInput,
  ToolEmitter,
} from "bee-agent-framework/tools/base";
import { RunContext } from "bee-agent-framework/context";
import { z } from "zod";

interface HumanToolOutput {
  clarification: string;
}

export interface Reader {
  write(prefix: string, message: string): void;
  askSingleQuestion(prompt: string, options?: { signal?: AbortSignal }): Promise<string>;
}

export interface HumanToolInput extends BaseToolOptions {
  reader: Reader;
  name?: string;
  description?: string;
}

/**
 * The HumanTool handles an interactive snippet-approval workflow:
 *
 * - scenario="refinement":
 *    The agent shows a code snippet and asks the user for possible modifications or clarifications.
 *    The user might respond with "Rename the function to 'fetch_riddle'" or "Add a docstring," etc.
 *
 * - scenario="approval":
 *    The agent shows the final code snippet and asks the user for a YES/NO.
 *    If "YES," the snippet is accepted; if "NO," it's rejected or revised further.
 */
export class HumanTool extends Tool<JSONToolOutput<HumanToolOutput>, HumanToolInput> {
  name = "HumanTool";
  description = `
    The agent calls this when it has a new or revised code snippet that needs human feedback or final approval.
    Input includes:
      scenario: "refinement" or "approval"
      message: instructions or a question to the user
      code?: the snippet being reviewed
    Output is always { "clarification": "<user typed text>" }.
    If scenario=refinement, user typed text can contain modifications.
    If scenario=approval, user typed text can be "YES" or "NO."
  `;

  public readonly emitter: ToolEmitter<ToolInput<this>, JSONToolOutput<HumanToolOutput>> =
    Emitter.root.child({
      namespace: ["tool", "human"],
      creator: this,
    });

  constructor(protected readonly input: HumanToolInput) {
    super(input);
    this.name = input?.name || this.name;
    this.description = input?.description || this.description;
  }

  inputSchema() {
    return z.object({
      scenario: z.enum(["refinement", "approval"]).default("refinement"),
      message: z.string().min(1),
      code: z.string().optional(),
    });
  }

  async _run(
    input: ToolInput<this>,
    _options: Partial<BaseToolRunOptions>,
    run: RunContext<this>,
  ): Promise<JSONToolOutput<HumanToolOutput>> {
    const { scenario, message, code } = input as {
      scenario: "refinement" | "approval";
      message: string;
      code?: string;
    };

    // Display scenario + message
    this.input.reader.write("HumanTool", `Scenario: ${scenario}`);
    this.input.reader.write("HumanTool", message);

    if (code) {
      this.input.reader.write(
        "HumanTool",
        `\n--- CODE SNIPPET START ---\n${code}\n--- CODE SNIPPET END ---\n`,
      );
    }

    // Ask a single question: either "Any changes?" or "YES/NO?"
    let userResponse = await this.input.reader.askSingleQuestion("You> ", { signal: run.signal });
    userResponse = userResponse.trim();

    // If scenario=approval and user typed something other than "YES"/"NO", we can default or let them re-try
    if (scenario === "approval") {
      const uppercase = userResponse.toUpperCase();
      if (uppercase !== "YES" && uppercase !== "NO") {
        userResponse = "NO"; // default if invalid
      }
    }

    return new JSONToolOutput({ clarification: userResponse });
  }
}
