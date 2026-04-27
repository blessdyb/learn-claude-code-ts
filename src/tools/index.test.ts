import { describe, it, expect } from 'vitest';
import { runBash } from './index.js';

describe('tools/index', () => {
  it('exports runBash', () => {
    expect(runBash).toBeDefined();
    expect(typeof runBash).toBe('function');
  });
});
