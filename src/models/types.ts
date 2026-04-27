/**
 * Unified tool definition across all model providers
 */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Tool call returned from model
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result block (returned from tool execution)
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

/**
 * Content block types for messages
 */
export type ContentBlock = ToolCallBlock | ToolResultBlock | { type: 'text'; text: string };

/**
 * Extended tool call block with type field for message content
 */
export interface ToolCallBlock extends ToolCall {
  type?: 'tool_use';
}

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

/**
 * Response from model
 */
export interface ModelResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

/**
 * Model provider interface - all models must implement this
 */
export interface ModelProvider {
  /**
   * Initialize the model with configuration
   */
  initialize(): Promise<void>;

  /**
   * Process a conversation with the model
   */
  chat(messages: Message[], systemPrompt: string, tools: Tool[]): Promise<ModelResponse>;
}
