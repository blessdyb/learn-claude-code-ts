import { describe, it, expect, vi } from 'vitest';

vi.mock('./openai.js', () => ({
  OpenAIProvider: class MockOpenAIProvider {},
}));

vi.mock('./anthropic.js', () => ({
  AnthropicProvider: class MockAnthropicProvider {},
}));

import { getModelProvider } from './index.js';
import * as openaiModule from './openai.js';
import * as anthropicModule from './anthropic.js';

describe('getModelProvider', () => {
  it('returns OpenAIProvider when provider is openai', () => {
    const provider = getModelProvider('openai');
    expect(provider).toBeInstanceOf(openaiModule.OpenAIProvider);
  });

  it('returns AnthropicProvider when provider is anthropic', () => {
    const provider = getModelProvider('anthropic');
    expect(provider).toBeInstanceOf(anthropicModule.AnthropicProvider);
  });

  it('throws for unknown providers', () => {
    expect(() => getModelProvider('unknown')).toThrow('Unknown model provider: unknown');
  });
});
