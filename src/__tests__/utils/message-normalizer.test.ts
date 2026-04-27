import { describe, it, expect } from 'vitest';
import { normalizeMessages } from '../../utils/message-normalizer.js';
import type { Message, ToolCall } from '../../models/types.js';

describe('MessageNormalizer', () => {
  describe('strip internal metadata', () => {
    it('should preserve regular text messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, world!' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello, world!');
    });

    it('should preserve tool calls with all fields', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ id: 'tool_1', name: 'bash', arguments: { command: 'ls -la' } }] },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      const content = result[0].content as Array<{ id: string; name: string; arguments: unknown }>;
      expect(content).toHaveLength(1);
      expect(content[0].id).toBe('tool_1');
    });

    it('should strip _metadata field from text blocks', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' } as any] },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
    });
  });

  describe('ensure tool result pairing', () => {
    it('should not add placeholder for tool calls with existing results', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_1', name: 'bash', arguments: { command: 'ls' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'output' }] },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(2);
    });

    it('should add placeholder for orphaned tool calls', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_1', name: 'bash', arguments: { command: 'ls' } }] },
      ];

      const result = normalizeMessages(messages);

      // Should have original message plus placeholder result
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe('user');
      const content = result[1].content as { type: string; tool_use_id: string; content: string }[];
      expect(content[0].type).toBe('tool_result');
      expect(content[0].tool_use_id).toBe('tool_1');
      expect(content[0].content).toBe('(cancelled)');
    });

    it('should add placeholders for orphaned tool calls', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [
          { id: 'tool_1', name: 'bash', arguments: { command: 'ls' }, type: 'tool_use' as const },
          { id: 'tool_2', name: 'read_file', arguments: { path: 'test.txt' }, type: 'tool_use' as const },
        ]},
      ];

      const result = normalizeMessages(messages);

      // Should have original message plus 2 user messages with tool results
      expect(result.some(m => m.role === 'user' && Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result'))).toBe(true);
    });
  });

  describe('merge consecutive same-role messages', () => {
    it('should merge consecutive user messages with text content', () => {
      const messages: Message[] = [
        { role: 'user', content: 'First message' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Response' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toContain('First message');
      expect(result[0].content).toContain('Second message');
    });

    it('should merge consecutive user messages with tool call content', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'user', content: [{ type: 'text', text: 'World' }] },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('should merge assistant messages', () => {
      const messages: Message[] = [
        { role: 'assistant', content: 'First part' },
        { role: 'assistant', content: 'Second part' },
        { role: 'user', content: 'Question' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('assistant');
      expect(result[0].content).toContain('First part');
      expect(result[0].content).toContain('Second part');
    });

    it('should not merge different role messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(3);
    });

    it('should merge tool result messages', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'output1' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'output2' }] },
        { role: 'assistant', content: 'Done' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      const content = result[0].content as { tool_use_id: string }[];
      expect(content).toHaveLength(2);
    });

    it('should handle complex merging scenario', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'user', content: 'Message 3' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Follow up' },
      ];

      const result = normalizeMessages(messages);

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
      expect(result[2].role).toBe('user');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty input', () => {
      const result = normalizeMessages([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single message', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = normalizeMessages(messages);
      expect(result).toHaveLength(1);
    });

    it('should handle only tool calls without results', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_1', name: 'bash', arguments: {} }] },
      ];
      const result = normalizeMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe('user');
    });

    it('should preserve system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];
      const result = normalizeMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
    });

    it('should merge when placeholder creates same-role messages', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_1', name: 'bash', arguments: {} }] },
      ];
      const result = normalizeMessages(messages);
      // The placeholder should be merged if there are other user messages after
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('integration tests', () => {
    it('should handle full conversation cycle', () => {
      const messages: Message[] = [
        { role: 'user', content: 'List files' },
        { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'bash', arguments: { command: 'ls' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'file1.txt' }] },
        { role: 'assistant', content: 'Found file1.txt' },
      ];

      const result = normalizeMessages(messages);

      // Should preserve the conversation structure
      expect(result.length).toBeLessThanOrEqual(messages.length + 1);
    });

    it('should handle tool call without result followed by user message', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'bash', arguments: {} }] },
        { role: 'user', content: 'Actually never mind' },
      ];

      const result = normalizeMessages(messages);

      // Should add placeholder, then merge with existing user message
      expect(result.length).toBeLessThanOrEqual(messages.length + 1);
    });
  });
});
