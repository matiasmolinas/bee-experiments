// createCustomTool.ts
import { z } from "zod";
import {
  Tool,
  StringToolOutput,
  ToolInput,
  ToolEmitter,
  AnyTool,
} from "bee-agent-framework/tools/base";
import { CodeInterpreterOptions } from "bee-agent-framework/tools/python/python";
import { CustomTool } from "bee-agent-framework/tools/custom";
import { FrameworkError } from "bee-agent-framework/errors";
import { Emitter } from "bee-agent-framework/emitter/emitter";

import { checkFirmwarePolicy, createToolRecord, saveToolRecord } from "./firmwareAndLibrary.js";

const DEV_MODE = process.env.DEVELOPER_MODE === "true";

/**
 * A dynamic tool that:
 *  - Takes name, description, sourceCode
 *  - Checks docstring & import policy
 *  - If dev mode=ON, instructs the agent to refine or get final "YES" from user
 *  - On success, registers a new CustomTool + saves it to the library
 */
export class CreateCustomTool extends Tool<StringToolOutput> {
  name = "create_custom_tool";
  description = `
    Generates a brand-new CustomTool from the provided Python snippet.
    If dev mode=ON, you must show the snippet to the user using "HumanTool"
    for possible refinements or final approval (YES/NO).
  `;

  public readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput> = Emitter.root.child({
    namespace: ["tool", "createCustomTool"],
    creator: this,
  });

  constructor(
    private codeInterpreter: CodeInterpreterOptions,
    private toolsRef: AnyTool[],
  ) {
    super({});
  }

  inputSchema() {
    return z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      sourceCode: z.string().min(1),
      inputSchema: z.any().optional(),
    });
  }

  protected async _run(input: ToolInput<this>): Promise<StringToolOutput> {
    try {
      // 1) Firmware checks
      const { approved, errors } = checkFirmwarePolicy(input.sourceCode);
      if (!approved) {
        return new StringToolOutput(`Snippet REJECTED by firmware: ${errors.join("; ")}`);
      }

      // 2) If dev mode=ON => ask the agent to do a "refine" + "approval" cycle with HumanTool
      if (DEV_MODE) {
        // We do not directly call the tool here, but we can hint the LLM
        // that scenario="refinement" or scenario="approval" is needed.
        return new StringToolOutput(
          JSON.stringify({
            message: `Dev mode active. Use 'HumanTool' with scenario='refinement' or 'approval' 
                    to let user see snippet, refine it, and eventually type YES. 
                    Then call 'create_custom_tool' again with the final snippet if user modifies it,
                    or proceed if user typed "YES".`,
            snippet: input.sourceCode,
          }),
        );
      }

      // 3) If dev mode=OFF or we assume user already gave final "YES," create the CustomTool
      const newTool = await CustomTool.fromSourceCode(this.codeInterpreter, input.sourceCode);
      newTool.name = input.name;
      newTool.description = input.description;

      if (input.inputSchema) {
        (newTool as any).options.inputSchema = input.inputSchema;
      }

      // 4) Register in the tool array
      this.toolsRef.push(newTool as AnyTool);

      // 5) Store it in the library for future sessions or other agents
      const rec = createToolRecord(input.name, input.description, input.sourceCode);
      saveToolRecord(rec);

      // 6) Return success
      const response = {
        tool_name: newTool.name,
        message: `A new tool named '${newTool.name}' was created, dev mode=OFF or user already approved. Stored in library.`,
      };
      return new StringToolOutput(JSON.stringify(response));
    } catch (err: any) {
      throw new FrameworkError(`Failed to create new custom tool: ${err.message}`, [err]);
    }
  }
}
