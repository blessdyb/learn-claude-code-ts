import type {
  ModelProvider,
  Message,
  Tool,
  ModelResponse,
  ToolCall,
} from '../../models/types.js';

/**
 * Test implementation of ModelProvider for unit testing
 * Returns predictable responses for testing purposes
 */
export class TestProvider implements ModelProvider {
  private mockResponses: Array<{
    content: string;
    toolCalls: ToolCall[];
    stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  }>;

  public called: boolean = false;
  private responseIndex: number = 0;

  constructor(
    responses: Array<{
      content: string;
      toolCalls?: ToolCall[];
      stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
    }> = [
      {
        content: 'This is a test response',
        toolCalls: [],
        stopReason: 'end_turn',
      },
    ],
  ) {
    this.mockResponses = responses.map((r) => ({
      content: r.content,
      toolCalls: r.toolCalls || [],
      stopReason: r.stopReason || 'end_turn',
    }));
  }

  async initialize(): Promise<void> {
    this.called = true;
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    tools: Tool[],
  ): Promise<ModelResponse> {
    const response =
      this.mockResponses[this.responseIndex % this.mockResponses.length];
    this.responseIndex++;

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      stopReason: response.stopReason,
    };
  }

  get callCount(): number {
    return this.responseIndex;
  }

  reset(): void {
    this.responseIndex = 0;
    this.called = false;
  }
}

/**
 * Test provider that returns tool calls
 * Useful for testing the tool execution flow
 */
export class TestProviderWithTools extends TestProvider {
  constructor() {
    super([
      {
        content: '',
        toolCalls: [
          {
            id: 'test_tool_1',
            name: 'bash',
            arguments: { command: 'echo "test"' },
          },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'Command completed successfully',
        toolCalls: [],
        stopReason: 'end_turn',
      },
    ]);
  }
}

/**
 * Test provider that returns multiple tool calls in one response
 */
export class TestProviderWithMultipleTools extends TestProvider {
  constructor() {
    super([
      {
        content: '',
        toolCalls: [
          {
            id: 'tool_1',
            name: 'bash',
            arguments: { command: 'ls -la' },
          },
          {
            id: 'tool_2',
            name: 'bash',
            arguments: { command: 'pwd' },
          },
        ],
        stopReason: 'tool_use',
      },
      {
        content: 'All commands completed',
        toolCalls: [],
        stopReason: 'end_turn',
      },
    ]);
  }
}
