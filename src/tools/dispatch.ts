import { logger } from '../utils/logger.js';

export type ToolName = 'bash' | 'read_file' | 'write_file' | 'edit_file';

export type ToolCategory = 'read-only' | 'mutating';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  category: ToolCategory;
}

export interface ToolResult {
  id: string;
  output: string;
  error?: string;
}

export interface ToolExecutor {
  (args: Record<string, unknown>): Promise<string>;
}

/**
 * Tool dispatch layer with concurrency control
 * - Read-only tools run in parallel
 * - Mutating tools are serialized
 */
export class ToolDispatcher {
  private executing = false;
  private pendingMutating: Array<{
    toolCallId: string;
    name: ToolName;
    args: Record<string, unknown>;
    resolve: (result: ToolResult) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private readonly executors: Record<ToolName, ToolExecutor>) {}

  /**
   * Execute multiple tool calls with concurrency control
   */
  async executeTools(toolCalls: {
    id: string;
    name: ToolName;
    args: Record<string, unknown>;
  }[]): Promise<ToolResult[]> {
    if (toolCalls.length === 0) return [];

    const isAllReadOnly = toolCalls.every(
      tc => this.getCategory(tc.name) === 'read-only'
    );

    if (isAllReadOnly) {
      // Run read-only tools in parallel
      return await Promise.all(
        toolCalls.map(tc => this.executeSingle(tc))
      );
    } else {
      // Mix of read-only and mutating, or all mutating
      // Serialize all mutating tools, run read-only in parallel where safe
      return await this.executeWithSerialization(toolCalls);
    }
  }

  private getCategory(name: ToolName): ToolCategory {
    switch (name) {
      case 'read_file':
      case 'bash':
        return 'read-only';
      case 'write_file':
      case 'edit_file':
        return 'mutating';
      default:
        return 'read-only';
    }
  }

  private async executeWithSerialization(
    toolCalls: { id: string; name: ToolName; args: Record<string, unknown> }[]
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // Separate read-only and mutating tools
    const readOnly = toolCalls.filter(
      tc => this.getCategory(tc.name) === 'read-only'
    );
    const mutating = toolCalls.filter(
      tc => this.getCategory(tc.name) === 'mutating'
    );

    // Execute mutating tools serially
    for (const call of mutating) {
      const result = await this.executeSingle(call);
      results.push(result);
    }

    // Execute read-only tools in parallel after mutating are done
    if (readOnly.length > 0) {
      const readOnlyResults = await Promise.all(
        readOnly.map(tc => this.executeSingle(tc))
      );
      results.push(...readOnlyResults);
    }

    return results;
  }

  private async executeSingle(call: {
    id: string;
    name: ToolName;
    args: Record<string, unknown>;
  }): Promise<ToolResult> {
    logger.debug('execute-tool', `Executing ${call.name} with args: ${JSON.stringify(call.args)}`);

    try {
      const executor = this.executors[call.name];
      if (!executor) {
        throw new Error(`Unknown tool: ${call.name}`);
      }

      const output = await executor(call.args);

      logger.debug('tool-result', {
        id: call.id,
        name: call.name,
        outputLength: output.length,
      });

      return { id: call.id, output };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('tool-execution-error', {
        id: call.id,
        name: call.name,
        error: errorMsg,
      });

      return { id: call.id, output: `Error: ${errorMsg}` };
    }
  }
}
