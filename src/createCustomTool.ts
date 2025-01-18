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

/**
 * A tool that the agent can call to create another CustomTool on the fly.
 */
export class CreateCustomTool extends Tool<StringToolOutput> {
  // Provide a name and description for your new tool
  name = "create_custom_tool";
  description =
    "Creates a brand new CustomTool on-the-fly by providing name, description, sourceCode, and optional inputSchema. Returns JSON with the new tool's name.";

  /**
   * The emitter property is required by the Tool base class.
   * We assign a new child emitter from the root.
   */
  public readonly emitter: ToolEmitter<ToolInput<this>, StringToolOutput> = Emitter.root.child({
    namespace: ["tool", "createCustomTool"],
    creator: this,
  });

  /**
   * Keep a reference to the array of tools, so we can .push() the newly created tool.
   * Use the type AnyTool[] to avoid mismatched generics.
   */
  constructor(
    private codeInterpreter: CodeInterpreterOptions,
    private toolsRef: AnyTool[],
  ) {
    super({});
  }

  /**
   * The agent must pass JSON arguments that match this schema:
   * {
   *   name: string,
   *   description: string,
   *   sourceCode: string,
   *   inputSchema?: any
   * }
   */
  inputSchema() {
    return z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      sourceCode: z.string().min(1),
      inputSchema: z.any().optional(),
    });
  }

  /**
   * The core execution method that the agent will call.
   * We parse the input, generate a new CustomTool, push it into the tool array, and return the new tool name.
   */
  protected async _run(input: ToolInput<this>): Promise<StringToolOutput> {
    try {
      // Dynamically create the new tool
      const newTool = await CustomTool.fromSourceCode(this.codeInterpreter, input.sourceCode);

      // Override the auto-detected name and description if provided by the agent
      if (input.name) {newTool.name = input.name;}
      if (input.description) {newTool.description = input.description;}

      // If the user provided an explicit input schema, override it
      if (input.inputSchema) {
        (newTool as any).options.inputSchema = input.inputSchema;
      }

      // Register the new tool in the agent's tool list
      this.toolsRef.push(newTool as AnyTool);

      // Return JSON with the new tool's name
      const outputJSON = {
        tool_name: newTool.name,
        message: `A new tool named '${newTool.name}' has been created and added to the toolset.`,
      };

      return new StringToolOutput(JSON.stringify(outputJSON));
    } catch (e: any) {
      throw new FrameworkError(`Failed to create new custom tool: ${e.message}`, [e]);
    }
  }
}
