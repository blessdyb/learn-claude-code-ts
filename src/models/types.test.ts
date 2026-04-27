import { describe, it, expect } from 'vitest';

// Import types for testing
import type { Message, Tool, ModelResponse, ToolCall } from './types.js';
import type { ModelProvider } from './types.js';

describe('Model Types', () => {
  describe('Message interface', () => {
    it('should have valid user message structure', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello, world!',
      };

      expect(message.role).toBe('user');
      expect(typeof message.content).toBe('string');
    });

    it('should have valid assistant message structure', () => {
      const message: Message = {
        role: 'assistant',
        content: 'Hi there!',
      };

      expect(message.role).toBe('assistant');
    });

    it('should have valid system message structure', () => {
      const message: Message = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };

      expect(message.role).toBe('system');
    });

    it('should allow tool calls as content', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool_1',
          name: 'bash',
          arguments: { command: 'ls -la' },
        },
      ];

      const message: Message = {
        role: 'user',
        content: toolCalls,
      };

      expect(message.role).toBe('user');
      expect(Array.isArray(message.content)).toBe(true);
    });
  });

  describe('Tool interface', () => {
    it('should have valid tool structure', () => {
      const tool: Tool = {
        name: 'bash',
        description: 'Run a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
      };

      expect(tool.name).toBe('bash');
      expect(tool.description).toBe('Run a shell command');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.required).toContain('command');
    });
  });

  describe('ToolCall interface', () => {
    it('should have valid tool call structure', () => {
      const toolCall: ToolCall = {
        id: 'tool_123',
        name: 'bash',
        arguments: {
          command: 'echo "hello"',
        },
      };

      expect(toolCall.id).toBe('tool_123');
      expect(toolCall.name).toBe('bash');
      expect(toolCall.arguments.command).toBe('echo "hello"');
    });
  });

  describe('ModelResponse interface', () => {
    it('should have valid response structure with content only', () => {
      const response: ModelResponse = {
        content: 'This is a text response',
        toolCalls: [],
        stopReason: 'end_turn',
      };

      expect(response.content).toBe('This is a text response');
      expect(response.toolCalls.length).toBe(0);
      expect(response.stopReason).toBe('end_turn');
    });

    it('should have valid response structure with tool calls', () => {
      const response: ModelResponse = {
        content: '',
        toolCalls: [
          {
            id: 'tool_1',
            name: 'bash',
            arguments: { command: 'ls -la' },
          },
        ],
        stopReason: 'tool_use',
      };

      expect(response.toolCalls.length).toBe(1);
      expect(response.stopReason).toBe('tool_use');
    });

    it('should support all stopReason values', () => {
      const endTurn: ModelResponse = {
        content: 'Done',
        toolCalls: [],
        stopReason: 'end_turn',
      };

      const toolUse: ModelResponse = {
        content: '',
        toolCalls: [],
        stopReason: 'tool_use',
      };

      const maxTokens: ModelResponse = {
        content: 'Partial',
        toolCalls: [],
        stopReason: 'max_tokens',
      };

      expect(endTurn.stopReason).toBe('end_turn');
      expect(toolUse.stopReason).toBe('tool_use');
      expect(maxTokens.stopReason).toBe('max_tokens');
    });
  });

  describe('ModelProvider interface', () => {
    it('should define required methods', () => {
      // This tests that the interface has the right shape
      // We can't instantiate the interface, but we can verify
      // the types are correct by checking the type exports
      type RequiredKeys =
        | 'initialize'
        | 'chat'
        | 'Message'
        | 'Tool'
        | 'ModelResponse'
        | 'ToolCall';

      expect<RequiredKeys>('initialize').toBe('initialize');
      expect<RequiredKeys>('chat').toBe('chat');
    });

    it('should have correct method signatures', () => {
      // Mock implementation to verify signature compatibility
      const mockProvider: ModelProvider = {
        async initialize() {
          // Mock initialization
        },
        async chat(_messages, _systemPrompt, _tools) {
          return {
            content: '',
            toolCalls: [],
            stopReason: 'end_turn',
          };
        },
      };

      expect(mockProvider).toHaveProperty('initialize');
      expect(mockProvider).toHaveProperty('chat');
    });
  });

  describe('Type conversions', () => {
    it('should handle empty content', () => {
      const response: ModelResponse = {
        content: '',
        toolCalls: [],
        stopReason: 'end_turn',
      };

      expect(response.content).toBe('');
    });

    it('should handle complex tool arguments', () => {
      const toolCall: ToolCall = {
        id: 'complex_tool',
        name: 'bash',
        arguments: {
          command: 'echo "hello" | grep hello',
        },
      };

      expect(toolCall.arguments.command).toBe('echo "hello" | grep hello');
    });

    it('should handle multiple tool calls', () => {
      const response: ModelResponse = {
        content: '',
        toolCalls: [
          { id: '1', name: 'bash', arguments: { command: 'ls' } },
          { id: '2', name: 'bash', arguments: { command: 'pwd' } },
        ],
        stopReason: 'tool_use',
      };

      expect(response.toolCalls.length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long content', () => {
      const longContent = 'a'.repeat(10000);
      const response: ModelResponse = {
        content: longContent,
        toolCalls: [],
        stopReason: 'end_turn',
      };

      expect(response.content.length).toBe(10000);
    });

    it('should handle special characters in content', () => {
      const response: ModelResponse = {
        content: 'Hello\n\tWorld! Special: <>&"\'',
        toolCalls: [],
        stopReason: 'end_turn',
      };

      expect(response.content).toBe('Hello\n\tWorld! Special: <>&"\'');
    });

    it('should handle unicode content', () => {
      const response: ModelResponse = {
        content: 'Hello 世界! 🌍 Привет мир!',
        toolCalls: [],
        stopReason: 'end_turn',
      };

      expect(response.content).toBe('Hello 世界! 🌍 Привет мир!');
    });
  });
});
