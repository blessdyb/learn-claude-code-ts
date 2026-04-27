/**
 * Unified tool definition across all model providers
 */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Tool call returned from model
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ToolCall[];
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
