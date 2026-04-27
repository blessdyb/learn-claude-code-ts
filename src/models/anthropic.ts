import { Anthropic } from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import type { ModelProvider, Message, Tool, ModelResponse, ToolCall } from './types.js';

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.model = process.env['ANTHROPIC_MODEL'] ?? 'qwen3.5:9b';
    this.client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
      baseURL: process.env['ANTHROPIC_BASE_URL'],
    });
  }

  async initialize(): Promise<void> {
    console.log({
      provider: 'Anthropic',
      model: this.model,
      baseURL: process.env['ANTHROPIC_BASE_URL'],
    });
  }

  async chat(messages: Message[], systemPrompt: string, tools: Tool[]): Promise<ModelResponse> {
    // Convert unified message format to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content:
          typeof m.content === 'string' ? m.content : this.convertToolCallsToContent(m.content),
      }));

    // Convert unified tool format to Anthropic format
    const anthropicTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));

    // Log request payload
    const requestPayload = {
      model: this.model,
      max_tokens: 8000,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    };
    logger.logApiRequest('Anthropic', 'messages.create', requestPayload);

    const startTime = Date.now();
    const response = await this.client.messages.create(requestPayload);
    const duration = Date.now() - startTime;

    // Log response
    logger.logApiResponse(
      'Anthropic',
      {
        id: response.id,
        model: response.model,
        content: response.content,
        stop_reason: response.stop_reason,
        usage: response.usage,
      },
      duration
    );

    // Parse response
    const toolCalls: ToolCall[] = [];
    let content = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        content = block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, any>) || {},
        });
      }
    }

    return {
      content,
      toolCalls,
      stopReason:
        response.stop_reason === 'tool_use'
          ? 'tool_use'
          : response.stop_reason === 'end_turn'
            ? 'end_turn'
            : 'max_tokens',
    };
  }

  private convertToolCallsToContent(toolCalls: ToolCall[]): string {
    return toolCalls
      .map(tc => {
        const formattedArgs = JSON.stringify(tc.arguments, null, 2).replace(
          /^\s*"([^\"]+)":/gm,
          '$1:'
        );
        return `Tool call: ${tc.name} with args: ${formattedArgs}`;
      })
      .join('\n');
  }
}
