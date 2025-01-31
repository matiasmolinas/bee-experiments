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
const TOOL_VERSION = "2.1.0";

export class CreateCustomTool extends Tool<StringToolOutput> {
  name = "create_custom_tool";
  description = `
    Generates a brand-new CustomTool from the provided Python snippet.
    If dev mode=true, you must show the snippet to the user using "HumanTool"
    for possible refinements or final approval (YES/NO).
    Tool Version: ${TOOL_VERSION}
  `;

  private weakToolsRef: WeakRef<AnyTool[]>;

  public readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput> = Emitter.root.child({
    namespace: ["tool", "createCustomTool"],
    creator: this,
  });

  constructor(
    private codeInterpreter: CodeInterpreterOptions,
    toolsRef: AnyTool[],
  ) {
    super({});
    this.weakToolsRef = new WeakRef(toolsRef);
    console.log(`CreateCustomTool initialized - Version ${TOOL_VERSION} - Dev Mode: ${DEV_MODE}`);
  }

  inputSchema() {
    return z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      sourceCode: z.string().min(1),
      inputSchema: z.any().optional(),
      approved: z.boolean().optional(), // New field to track approval
    });
  }

  createSnapshot() {
    const base = super.createSnapshot();
    return {
      ...base,
      version: TOOL_VERSION,
      toolsRef: "[WeakRef]",
    };
  }

  protected async _run(input: ToolInput<this>): Promise<StringToolOutput> {
    try {
      const tools = this.weakToolsRef.deref();
      if (!tools) {
        throw new FrameworkError("Tools reference has been garbage collected");
      }

      console.log(`CreateCustomTool ${TOOL_VERSION} - Processing tool: ${input.name}`);

      // 1) Firmware checks
      const { approved, errors } = checkFirmwarePolicy(input.sourceCode);
      if (!approved) {
        console.log(`CreateCustomTool ${TOOL_VERSION} - Firmware rejected snippet`);
        return new StringToolOutput(`Snippet REJECTED by firmware: ${errors.join("; ")}`);
      }

      // 2) Dev mode handling
      if (DEV_MODE && !input.approved) {
        console.log(`CreateCustomTool ${TOOL_VERSION} - Requesting user approval`);
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

      // 3) Create and save tool
      console.log(`CreateCustomTool ${TOOL_VERSION} - Creating new tool`);
      const newTool = await CustomTool.fromSourceCode(this.codeInterpreter, input.sourceCode);
      newTool.name = input.name;
      newTool.description = input.description;
      if (input.inputSchema) {
        (newTool as any).options.inputSchema = input.inputSchema;
      }

      tools.push(newTool as AnyTool);

      // Save to library
      console.log(`CreateCustomTool ${TOOL_VERSION} - Saving tool to library`);
      const rec = createToolRecord(input.name, input.description, input.sourceCode);
      saveToolRecord(rec);

      console.log(`CreateCustomTool ${TOOL_VERSION} - Successfully created and saved tool: ${input.name}`);

      return new StringToolOutput(
        JSON.stringify({
          tool_name: newTool.name,
          version: TOOL_VERSION,
          message: `Tool '${newTool.name}' created and saved to library. ${
            DEV_MODE ? "User approved." : "Dev mode=OFF."
          }`,
        }),
      );
    } catch (err: any) {
      console.error(`CreateCustomTool ${TOOL_VERSION} - Error:`, err.message);
      throw new FrameworkError(`Failed to create new custom tool: ${err.message}`, [err]);
    }
  }
}