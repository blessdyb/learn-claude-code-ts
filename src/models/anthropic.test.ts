import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import { logger } from '../utils/logger.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    logApiRequest: vi.fn(),
    logApiResponse: vi.fn(),
  },
}));

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn(),
}));

// Import Anthropic after mock
import { Anthropic } from '@anthropic-ai/sdk';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockClient: any;
  let mockMessages: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock messages API
    mockMessages = {
      create: vi.fn(),
    };

    // Setup mock Anthropic client
    mockClient = {
      messages: mockMessages,
    };

    // Mock the Anthropic class constructor
    (Anthropic as any).mockImplementation(() => mockClient);

    // Setup environment
    process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
    process.env['ANTHROPIC_BASE_URL'] = 'https://test.anthropic.com';
    process.env['ANTHROPIC_MODEL'] = 'claude-3-test';

    provider = new AnthropicProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_BASE_URL'];
    delete process.env['ANTHROPIC_MODEL'];
  });

  describe('constructor', () => {
    it('should initialize with default model', () => {
      const testProvider = new AnthropicProvider();
      expect(testProvider).toBeDefined();
    });

    it('should use provided API key and base URL', () => {
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://test.anthropic.com',
      });
    });

    it('should use default model when not specified', () => {
      delete process.env['ANTHROPIC_MODEL'];
      const testProvider = new AnthropicProvider();
      expect(testProvider).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should log initialization info', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await provider.initialize();

      expect(consoleSpy).toHaveBeenCalledWith({
        provider: 'Anthropic',
        model: 'claude-3-test',
        baseURL: 'https://test.anthropic.com',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('chat - text responses', () => {
    it('should convert messages and return text response', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'This is a test response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        { role: 'user', content: 'Hello' },
      ];
      const systemPrompt = 'You are a helpful assistant';
      const tools: any[] = [];

      const result = await provider.chat(messages, systemPrompt, tools);

      expect(result).toEqual({
        content: 'This is a test response',
        toolCalls: [],
        stopReason: 'end_turn',
      });

      expect(mockMessages.create).toHaveBeenCalled();
    });

    it('should filter out system messages and add as system parameter', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chat(messages, 'System prompt', []);

      const callArgs = mockMessages.create.mock.calls[0][0];
      expect(callArgs.system).toBe('System prompt');
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toBe('Hello');
    });

    it('should handle multiple conversation messages', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Second' },
        { role: 'user', content: 'Third' },
      ];

      await provider.chat(messages, 'System', []);

      const callArgs = mockMessages.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[1].role).toBe('assistant');
      expect(callArgs.messages[2].role).toBe('user');
    });
  });

  describe('chat - tool use responses', () => {
    it('should parse tool_use blocks from response', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: '',
          },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'bash',
            input: { command: 'ls -la' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'List files' }];
      const systemPrompt = 'You can run commands';
      const tools: any[] = [
        {
          name: 'bash',
          description: 'Run a shell command',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' },
            },
            required: ['command'],
          },
        },
      ];

      const result = await provider.chat(messages, systemPrompt, tools);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'tool_123',
        name: 'bash',
        arguments: { command: 'ls -la' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle multiple tool use blocks', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: '',
          },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: { command: 'ls' },
          },
          {
            type: 'tool_use',
            id: 'tool_2',
            name: 'bash',
            input: { command: 'pwd' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'Get info' }];
      const systemPrompt = 'You can run commands';
      const tools: any[] = [];

      const result = await provider.chat(messages, systemPrompt, tools);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].id).toBe('tool_1');
      expect(result.toolCalls[1].id).toBe('tool_2');
    });

    it('should extract text content from tool_use response', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Here is the result:',
          },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: { command: 'ls' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.content).toBe('Here is the result:');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('should handle empty text content with tool_use', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: { command: 'ls' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(1);
    });
  });

  describe('chat - tool input conversion', () => {
    it('should convert tools to Anthropic format', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'Hello' }];
      const tools: any[] = [
        {
          name: 'custom_tool',
          description: 'A custom tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
              param2: { type: 'number' },
            },
            required: ['param1'],
          },
        },
      ];

      await provider.chat(messages, 'System', tools);

      const callArgs = mockMessages.create.mock.calls[0][0];
      expect(callArgs.tools).toHaveLength(1);
      expect(callArgs.tools[0].name).toBe('custom_tool');
      expect(callArgs.tools[0].description).toBe('A custom tool');
      expect(callArgs.tools[0].input_schema.type).toBe('object');
      expect(callArgs.tools[0].input_schema.properties).toEqual({
        param1: { type: 'string' },
        param2: { type: 'number' },
      });
      expect(callArgs.tools[0].input_schema.required).toEqual(['param1']);
    });
  });

  describe('chat - message content conversion', () => {
    it('should convert tool calls to text in user messages', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        {
          role: 'assistant',
          content: [
            {
              id: 'tool_1',
              name: 'bash',
              arguments: { command: 'ls' },
            },
          ],
        },
      ];

      await provider.chat(messages, 'System', []);

      const callArgs = mockMessages.create.mock.calls[0][0];
      const assistantMessage = callArgs.messages[0];
      expect(assistantMessage.content).toContain('Tool call: bash');
      expect(assistantMessage.content).toContain('command: "ls"');
    });

    it('should handle multiple tool calls in content', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        {
          role: 'assistant',
          content: [
            {
              id: 'tool_1',
              name: 'bash',
              arguments: { command: 'ls' },
            },
            {
              id: 'tool_2',
              name: 'bash',
              arguments: { command: 'pwd' },
            },
          ],
        },
      ];

      await provider.chat(messages, 'System', []);

      const callArgs = mockMessages.create.mock.calls[0][0];
      const assistantMessage = callArgs.messages[0];
      expect(assistantMessage.content).toContain('Tool call: bash');
      expect(assistantMessage.content).toContain('command: "ls"');
      expect(assistantMessage.content).toContain('command: "pwd"');
    });
  });

  describe('stop reason mapping', () => {
    it('should map tool_use to tool_use', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: '',
          },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: { command: 'ls' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.stopReason).toBe('tool_use');
    });

    it('should map end_turn to end_turn', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Done',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.stopReason).toBe('end_turn');
    });

    it('should map max_tokens to max_tokens', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Partial',
          },
        ],
        stop_reason: 'max_tokens',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.stopReason).toBe('max_tokens');
    });

    it('should handle unknown stop_reason as max_tokens', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'unknown_reason' as any,
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.stopReason).toBe('max_tokens');
    });
  });

  describe('logging', () => {
    it('should log API request and response', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system prompt',
        []
      );

      expect(logger.logApiRequest).toHaveBeenCalled();
      expect(logger.logApiResponse).toHaveBeenCalled();
    });

    it('should include correct parameters in request logging', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const tools: any[] = [
        {
          name: 'bash',
          description: 'Run command',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      ];

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        tools
      );

      const requestCall = (logger.logApiRequest as any).mock.calls[0];
      expect(requestCall[0]).toBe('Anthropic');
      expect(requestCall[1]).toBe('messages.create');
      expect(requestCall[2].model).toBe('claude-3-test');
      expect(requestCall[2].max_tokens).toBe(8000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input in tool_use', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: {},
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.toolCalls[0].arguments).toEqual({});
    });

    it('should handle complex nested tool inputs', async () => {
      const complexInput = {
        command: 'echo "hello"',
        args: {
          nested: {
            deep: 'value',
          },
        },
      };

      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: complexInput,
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.toolCalls[0].arguments).toEqual(complexInput);
    });

    it('should handle only text block with no tool_use', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Just text response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.content).toBe('Just text response');
      expect(result.toolCalls).toHaveLength(0);
    });

    it('should handle empty content array', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(0);
    });

    it('should handle mixed text and tool_use blocks', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'First part',
          },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'bash',
            input: { command: 'ls' },
          },
          {
            type: 'text',
            text: 'Second part',
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat(
        [{ role: 'user', content: 'test' }],
        'system',
        []
      );

      // The last text block should be used
      expect(result.content).toBe('Second part');
      expect(result.toolCalls).toHaveLength(1);
    });
  });

  describe('message filtering', () => {
    it('should exclude system role messages from conversation', async () => {
      const mockResponse = {
        id: 'msg-test',
        model: 'claude-3-test',
        content: [
          {
            type: 'text',
            text: 'Response',
          },
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      };

      mockMessages.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        { role: 'system', content: 'System 1' },
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'System 2' },
        { role: 'assistant', content: 'Hi' },
      ];

      await provider.chat(messages, 'System prompt', []);

      const callArgs = mockMessages.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[1].role).toBe('assistant');
    });
  });
});
