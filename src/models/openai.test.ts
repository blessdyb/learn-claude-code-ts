import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from './openai.js';
import { logger } from '../utils/logger.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    logApiRequest: vi.fn(),
    logApiResponse: vi.fn(),
  },
}));

// Track mock clients per test
const mockClients: Map<string, any> = new Map();

// Create a mock client for OpenAI
const createMockClient = () => {
  return {
    chat: {
      create: vi.fn(),
    },
  };
};

// Mock OpenAI class with factory function
vi.mock('openai', () => {
  return {
    default: vi.fn(() => {
      // Return the first available mock client
      return Array.from(mockClients.values()).find((c: any) => c && c.chat && c.chat.create);
    }),
    OpenAI: vi.fn(() => {
      return Array.from(mockClients.values()).find((c: any) => c && c.chat && c.chat.create);
    }),
  };
});

// Import OpenAI after mock
import { default as OpenAI } from 'openai';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockClient: any;
  let mockChat: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = createMockClient();
    mockChat = mockClient.chat;

    // Store mock client
    mockClients.set('openai', mockClient);

    // Setup environment
    process.env['OPENAI_API_KEY'] = 'test-api-key';
    process.env['OPENAI_BASE_URL'] = 'https://test.openai.com';
    process.env['OPENAI_MODEL'] = 'gpt-4-test';

    provider = new OpenAIProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockClients.clear();
    delete process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_BASE_URL'];
    delete process.env['OPENAI_MODEL'];
  });

  describe('constructor', () => {
    it('should initialize with default model', () => {
      const testProvider = new OpenAIProvider();
      expect(testProvider).toBeDefined();
    });

    it('should use provided API key and base URL', () => {
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://test.openai.com',
      });
    });

    it('should use default model when not specified', () => {
      delete process.env['OPENAI_MODEL'];
      const testProvider = new OpenAIProvider();
      expect(testProvider).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should log initialization info', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await provider.initialize();

      expect(consoleSpy).toHaveBeenCalledWith({
        provider: 'OpenAI',
        model: 'gpt-4-test',
        baseURL: 'https://test.openai.com',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('chat - text responses', () => {
    it('should convert messages and return text response', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'This is a test response',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'Hello' }];
      const systemPrompt = 'You are a helpful assistant';
      const tools: any[] = [];

      const result = await provider.chat(messages, systemPrompt, tools);

      expect(result).toEqual({
        content: 'This is a test response',
        toolCalls: [],
        stopReason: 'end_turn',
      });

      expect(mockChat.create).toHaveBeenCalled();
    });

    it('should include system message in conversation', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'Hello' }];

      await provider.chat(messages, 'System prompt', []);

      const callArgs = mockChat.create.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({
        role: 'system',
        content: 'System prompt',
      });
    });
  });

  describe('chat - tool call responses', () => {
    it('should parse tool calls from response', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify({ command: 'ls -la' }),
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

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
        id: 'call_123',
        name: 'bash',
        arguments: { command: 'ls -la' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle multiple tool calls', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify({ command: 'ls' }),
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify({ command: 'pwd' }),
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [{ role: 'user', content: 'Get info' }];
      const systemPrompt = 'You can run commands';
      const tools: any[] = [];

      const result = await provider.chat(messages, systemPrompt, tools);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('bash');
      expect(result.toolCalls[1].name).toBe('bash');
    });
  });

  describe('chat - tool results conversion', () => {
    it('should convert tool results to OpenAI format', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Done',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const messages: any[] = [
        { role: 'user', content: 'Hello' },
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
        {
          role: 'user',
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

      const callArgs = mockChat.create.mock.calls[0][0];
      const toolMessages = callArgs.messages.filter((m: any) => m.role === 'tool');

      expect(toolMessages).toHaveLength(1);
      expect(toolMessages[0].role).toBe('tool');
      expect(toolMessages[0].tool_call_id).toBe('tool_1');
      expect(JSON.parse(toolMessages[0].content)).toEqual({
        command: 'ls',
      });
    });
  });

  describe('chat - tool parameters conversion', () => {
    it('should convert tools to OpenAI format', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

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

      const callArgs = mockChat.create.mock.calls[0][0];
      expect(callArgs.tools).toHaveLength(1);
      expect(callArgs.tools[0].type).toBe('function');
      expect(callArgs.tools[0].function.name).toBe('custom_tool');
      expect(callArgs.tools[0].function.description).toBe('A custom tool');
      expect(callArgs.tools[0].function.parameters.type).toBe('object');
      expect(callArgs.tools[0].function.parameters.properties).toEqual({
        param1: { type: 'string' },
        param2: { type: 'number' },
      });
      expect(callArgs.tools[0].function.parameters.required).toEqual(['param1']);
    });
  });

  describe('createChatCompletion compatibility', () => {
    it('should use completions.create when chat.create is unavailable', async () => {
      delete mockChat.create;
      mockChat.completions = {
        create: vi.fn(),
      };

      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'Hello' }], 'System', []);

      expect(mockChat.completions.create).toHaveBeenCalled();
      expect(result.stopReason).toBe('end_turn');
    });

    it('should throw when no chat creation method is available', async () => {
      delete mockChat.create;
      mockChat.completions = {};

      await expect(
        provider.chat([{ role: 'user', content: 'Hello' }], 'System', [])
      ).rejects.toThrow('OpenAI client does not support chat completion creation');
    });
  });

  describe('stop reason mapping', () => {
    it('should map tool_calls to tool_use', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.stopReason).toBe('tool_use');
    });

    it('should map stop to end_turn', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Done',
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.stopReason).toBe('end_turn');
    });

    it('should map length to max_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'length',
            message: {
              role: 'assistant',
              content: 'Partial',
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.stopReason).toBe('max_tokens');
    });
  });

  describe('logging', () => {
    it('should log API request and response', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      await provider.chat([{ role: 'user', content: 'test' }], 'system prompt', []);

      expect(logger.logApiRequest).toHaveBeenCalled();
      expect(logger.logApiResponse).toHaveBeenCalled();
    });

    it('should include correct parameters in request logging', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

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

      await provider.chat([{ role: 'user', content: 'test' }], 'system', tools);

      const requestCall = (logger.logApiRequest as any).mock.calls[0];
      expect(requestCall[0]).toBe('OpenAI');
      expect(requestCall[1]).toBe('chat.completions.create');
      expect(requestCall[2].model).toBe('gpt-4-test');
      expect(requestCall[2].tool_choice).toBe('auto');
      expect(requestCall[2].max_tokens).toBe(8000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content in tool call arguments', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify({}),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.toolCalls[0].arguments).toEqual({});
    });

    it('should handle complex nested arguments', async () => {
      const complexArgs = {
        command: 'echo "hello"',
        args: {
          nested: {
            deep: 'value',
          },
        },
      };

      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'bash',
                    arguments: JSON.stringify(complexArgs),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.toolCalls[0].arguments).toEqual(complexArgs);
    });

    it('should handle response with no tool calls but tool_calls field present', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4-test',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'No tools needed',
              tool_calls: [],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      mockChat.create.mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], 'system', []);

      expect(result.content).toBe('No tools needed');
      expect(result.toolCalls).toHaveLength(0);
    });
  });
});
