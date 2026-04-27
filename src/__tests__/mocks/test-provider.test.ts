import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TestProvider,
  TestProviderWithTools,
  TestProviderWithMultipleTools,
} from './test-provider.js';
import type { Message, Tool } from '../../models/types.js';

describe('TestProvider', () => {
  let provider: TestProvider;
  const mockMessages: Message[] = [
    { role: 'user', content: 'Test message' },
  ];
  const mockTools: Tool[] = [];

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('initialization', () => {
    it('should start with called = false', () => {
      const p = new TestProvider();
      expect(p.called).toBe(false);
    });

    it('should set called = true after initialize', async () => {
      await provider.initialize();
      expect(provider.called).toBe(true);
    });
  });

  describe('chat method', () => {
    it('should return default test response', async () => {
      const response = await provider.chat(mockMessages, 'system', mockTools);

      expect(response.content).toBe('This is a test response');
      expect(response.toolCalls).toEqual([]);
      expect(response.stopReason).toBe('end_turn');
    });

    it('should be called multiple times', async () => {
      await provider.chat(mockMessages, 'system', mockTools);
      await provider.chat(mockMessages, 'system', mockTools);

      expect(provider.callCount).toBe(2);
    });

    it('should cycle through custom responses', async () => {
      const customResponses = [
        { content: 'First', stopReason: 'end_turn' as const },
        { content: 'Second', stopReason: 'end_turn' as const },
      ];

      const provider2 = new TestProvider(customResponses);

      const response1 = await provider2.chat(mockMessages, 'system', mockTools);
      const response2 = await provider2.chat(mockMessages, 'system', mockTools);

      expect(response1.content).toBe('First');
      expect(response2.content).toBe('Second');
    });
  });

  describe('reset method', () => {
    it('should reset call count', async () => {
      await provider.chat(mockMessages, 'system', mockTools);
      await provider.chat(mockMessages, 'system', mockTools);

      expect(provider.callCount).toBe(2);

      provider.reset();

      expect(provider.callCount).toBe(0);
      expect(provider.called).toBe(false);
    });
  });
});

describe('TestProviderWithTools', () => {
  let provider: TestProviderWithTools;
  const mockMessages: Message[] = [{ role: 'user', content: 'Test' }];
  const mockTools: Tool[] = [];

  beforeEach(() => {
    provider = new TestProviderWithTools();
  });

  it('should return tool call in first response', async () => {
    const response = await provider.chat(mockMessages, 'system', mockTools);

    expect(response.content).toBe('');
    expect(response.toolCalls.length).toBe(1);
    expect(response.toolCalls[0].name).toBe('bash');
    expect(response.toolCalls[0].arguments.command).toBe('echo "test"');
    expect(response.stopReason).toBe('tool_use');
  });

  it('should return text response after tool use', async () => {
    // First call returns tool
    await provider.chat(mockMessages, 'system', mockTools);

    // Second call returns text
    const response = await provider.chat(mockMessages, 'system', mockTools);

    expect(response.content).toBe('Command completed successfully');
    expect(response.toolCalls.length).toBe(0);
    expect(response.stopReason).toBe('end_turn');
  });
});

describe('TestProviderWithMultipleTools', () => {
  let provider: TestProviderWithMultipleTools;
  const mockMessages: Message[] = [{ role: 'user', content: 'Test' }];
  const mockTools: Tool[] = [];

  beforeEach(() => {
    provider = new TestProviderWithMultipleTools();
  });

  it('should return multiple tool calls', async () => {
    const response = await provider.chat(mockMessages, 'system', mockTools);

    expect(response.toolCalls.length).toBe(2);
    expect(response.toolCalls[0].id).toBe('tool_1');
    expect(response.toolCalls[1].id).toBe('tool_2');
  });

  it('should have correct tool arguments', async () => {
    const response = await provider.chat(mockMessages, 'system', mockTools);

    const command1 = response.toolCalls[0].arguments.command;
    const command2 = response.toolCalls[1].arguments.command;

    expect(command1).toBe('ls -la');
    expect(command2).toBe('pwd');
  });
});

describe('TestProvider edge cases', () => {
  it('should handle empty messages', async () => {
    const provider = new TestProvider();
    const response = await provider.chat([], 'system', []);

    expect(response.content).toBe('This is a test response');
  });

  it('should handle empty tools', async () => {
    const provider = new TestProvider();
    const response = await provider.chat(
      [{ role: 'user', content: 'test' }],
      'system',
      [],
    );

    expect(response.content).toBe('This is a test response');
  });

  it('should handle system prompt', async () => {
    const provider = new TestProvider();
    const systemPrompt = 'You are a test assistant';
    const response = await provider.chat([], systemPrompt, []);

    // System prompt is passed but not used by test provider
    expect(response.content).toBe('This is a test response');
  });

  it('should handle custom stop reasons', async () => {
    const provider = new TestProvider([
      { content: 'test', stopReason: 'max_tokens' },
    ]);

    const response = await provider.chat([], 'system', []);

    expect(response.stopReason).toBe('max_tokens');
  });
});
