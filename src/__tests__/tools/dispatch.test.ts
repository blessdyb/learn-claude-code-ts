import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import { ToolDispatcher } from '../../tools/dispatch.js';

describe('ToolDispatcher', () => {
  let dispatcher: ToolDispatcher;

  const mockExecutors = {
    bash: vi.fn(),
    read_file: vi.fn(),
    write_file: vi.fn(),
    edit_file: vi.fn(),
  } as Record<string, Mock>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new ToolDispatcher(mockExecutors as Record<'bash' | 'read_file' | 'write_file' | 'edit_file', (args: Record<string, unknown>) => Promise<string>>);
  });

  describe('single tool execution', () => {
    it('should execute bash tool successfully', async () => {
      mockExecutors.bash.mockResolvedValue('stdout result');

      const results = await dispatcher.executeTools([
        { id: '1', name: 'bash', args: { command: 'ls -la' } },
      ]);

      expect(results).toEqual([{ id: '1', output: 'stdout result' }]);
      expect(mockExecutors.bash).toHaveBeenCalledWith({ command: 'ls -la' });
    });

    it('should execute read_file tool successfully', async () => {
      mockExecutors.read_file.mockResolvedValue('file content');

      const results = await dispatcher.executeTools([
        { id: '1', name: 'read_file', args: { path: 'test.txt' } },
      ]);

      expect(results).toEqual([{ id: '1', output: 'file content' }]);
      expect(mockExecutors.read_file).toHaveBeenCalledWith({ path: 'test.txt' });
    });

    it('should execute write_file tool successfully', async () => {
      mockExecutors.write_file.mockResolvedValue('wrote 100 bytes');

      const results = await dispatcher.executeTools([
        { id: '1', name: 'write_file', args: { path: 'test.txt', content: 'hello' } },
      ]);

      expect(results).toEqual([{ id: '1', output: 'wrote 100 bytes' }]);
      expect(mockExecutors.write_file).toHaveBeenCalledWith({ path: 'test.txt', content: 'hello' });
    });

    it('should execute edit_file tool successfully', async () => {
      mockExecutors.edit_file.mockResolvedValue('edited file');

      const results = await dispatcher.executeTools([
        { id: '1', name: 'edit_file', args: { path: 'test.txt', old_text: 'hello', new_text: 'world' } },
      ]);

      expect(results).toEqual([{ id: '1', output: 'edited file' }]);
      expect(mockExecutors.edit_file).toHaveBeenCalledWith({ path: 'test.txt', old_text: 'hello', new_text: 'world' });
    });
  });

  describe('parallel read-only execution', () => {
    it('should run read-only tools in parallel', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.bash.mockImplementation(async () => {
        await delay(100);
        return 'bash result';
      });

      mockExecutors.read_file.mockImplementation(async () => {
        await delay(50);
        return 'read result';
      });

      const start = Date.now();
      const results = await dispatcher.executeTools([
        { id: '1', name: 'bash', args: { command: 'ls' } },
        { id: '2', name: 'read_file', args: { path: 'test.txt' } },
      ]);

      const elapsed = Date.now() - start;

      expect(results).toHaveLength(2);
      expect(elapsed).toBeLessThan(150); // Should be close to max of individual times, not sum
    });

    it('should handle multiple read-only tools in parallel', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.read_file.mockImplementation(async (args: Record<string, unknown>) => {
        await delay(30);
        return `content of ${args.path}`;
      });

      const results = await dispatcher.executeTools([
        { id: '1', name: 'read_file', args: { path: 'a.txt' } },
        { id: '2', name: 'read_file', args: { path: 'b.txt' } },
        { id: '3', name: 'read_file', args: { path: 'c.txt' } },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].output).toBe('content of a.txt');
      expect(results[1].output).toBe('content of b.txt');
      expect(results[2].output).toBe('content of c.txt');
    });
  });

  describe('serialized mutating execution', () => {
    it('should run mutating tools serially', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.write_file.mockImplementation(async (args: Record<string, unknown>) => {
        executionOrder.push(`write_${args.path}`);
        await delay(50);
        return `wrote ${args.path}`;
      });

      await dispatcher.executeTools([
        { id: '1', name: 'write_file', args: { path: 'a.txt', content: 'a' } },
        { id: '2', name: 'write_file', args: { path: 'b.txt', content: 'b' } },
        { id: '3', name: 'write_file', args: { path: 'c.txt', content: 'c' } },
      ]);

      expect(executionOrder).toEqual(['write_a.txt', 'write_b.txt', 'write_c.txt']);
    });

    it('should serialize edit_file operations', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.edit_file.mockImplementation(async (args: Record<string, unknown>) => {
        executionOrder.push(`edit_${args.path}`);
        await delay(30);
        return `edited ${args.path}`;
      });

      await dispatcher.executeTools([
        { id: '1', name: 'edit_file', args: { path: 'a.txt', old_text: 'x', new_text: 'y' } },
        { id: '2', name: 'edit_file', args: { path: 'b.txt', old_text: 'x', new_text: 'y' } },
      ]);

      expect(executionOrder).toEqual(['edit_a.txt', 'edit_b.txt']);
    });
  });

  describe('mixed read-only and mutating', () => {
    it('should run mutating first, then read-only in parallel', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.write_file.mockImplementation(async () => {
        executionOrder.push('write');
        await delay(50);
        return 'wrote';
      });

      mockExecutors.bash.mockImplementation(async () => {
        executionOrder.push('bash');
        await delay(20);
        return 'bash result';
      });

      mockExecutors.read_file.mockImplementation(async () => {
        executionOrder.push('read');
        await delay(20);
        return 'read result';
      });

      await dispatcher.executeTools([
        { id: '1', name: 'bash', args: { command: 'ls' } },
        { id: '2', name: 'write_file', args: { path: 'test.txt', content: 'data' } },
        { id: '3', name: 'read_file', args: { path: 'test.txt' } },
      ]);

      // Mutating should complete first, then read-only run in parallel
      expect(executionOrder[0]).toBe('write');
      expect(executionOrder.slice(1).sort()).toEqual(['bash', 'read']);
    });

    it('should handle mixed operations with proper ordering', async () => {
      const order: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockExecutors.write_file.mockImplementation(async (args: Record<string, unknown>) => {
        order.push(`w_${args.path}`);
        await delay(40);
        return 'ok';
      });

      mockExecutors.edit_file.mockImplementation(async (args: Record<string, unknown>) => {
        order.push(`e_${args.path}`);
        await delay(30);
        return 'ok';
      });

      mockExecutors.read_file.mockImplementation(async (args: Record<string, unknown>) => {
        order.push(`r_${args.path}`);
        await delay(20);
        return 'ok';
      });

      await dispatcher.executeTools([
        { id: '1', name: 'read_file', args: { path: 'a.txt' } },
        { id: '2', name: 'write_file', args: { path: 'a.txt', content: 'x' } },
        { id: '3', name: 'read_file', args: { path: 'b.txt' } },
        { id: '4', name: 'edit_file', args: { path: 'c.txt', old_text: 'x', new_text: 'y' } },
      ]);

      // Mutating operations first (serialized)
      expect(order[0]).toMatch(/^w_/);
      expect(order[1]).toMatch(/^e_/);
      // Then read-only operations (parallel)
      expect(order.slice(2).sort()).toEqual(['r_a.txt', 'r_b.txt']);
    });
  });

  describe('error handling', () => {
    it('should handle executor error gracefully', async () => {
      mockExecutors.bash.mockRejectedValue(new Error('Command failed'));

      const results = await dispatcher.executeTools([
        { id: '1', name: 'bash', args: { command: 'invalid' } },
      ]);

      expect(results).toEqual([{ id: '1', output: 'Error: Command failed' }]);
    });

    it('should continue on error when executing multiple tools', async () => {
      mockExecutors.bash.mockRejectedValue(new Error('bash error'));
      mockExecutors.read_file.mockResolvedValue('file content');

      const results = await dispatcher.executeTools([
        { id: '1', name: 'bash', args: { command: 'invalid' } },
        { id: '2', name: 'read_file', args: { path: 'test.txt' } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].output).toBe('Error: bash error');
      expect(results[1].output).toBe('file content');
    });

    it('should handle unknown tool', async () => {
      const results = await dispatcher.executeTools([
        { id: '1', name: 'unknown_tool' as any, args: {} },
      ]);

      expect(results[0].output).toContain('Unknown tool');
    });

    it('should handle empty tool calls array', async () => {
      const results = await dispatcher.executeTools([]);
      expect(results).toEqual([]);
    });
  });

  describe('concurrency control', () => {
    it('should track concurrent execution count', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const trackedExecutor = vi.fn().mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await delay(50);
        currentConcurrent--;
        return 'done';
      });

      const dispatcherWithTracking = new ToolDispatcher({
        bash: trackedExecutor as any,
        read_file: trackedExecutor as any,
        write_file: trackedExecutor as any,
        edit_file: trackedExecutor as any,
      });

      // Multiple read-only should run concurrently
      maxConcurrent = 0;
      await dispatcherWithTracking.executeTools([
        { id: '1', name: 'read_file', args: { path: 'a.txt' } },
        { id: '2', name: 'read_file', args: { path: 'b.txt' } },
        { id: '3', name: 'read_file', args: { path: 'c.txt' } },
      ]);
      expect(maxConcurrent).toBe(3); // All 3 run in parallel

      // Mutating should run serially
      maxConcurrent = 0;
      await dispatcherWithTracking.executeTools([
        { id: '1', name: 'write_file', args: { path: 'a.txt', content: 'x' } },
        { id: '2', name: 'write_file', args: { path: 'b.txt', content: 'y' } },
        { id: '3', name: 'write_file', args: { path: 'c.txt', content: 'z' } },
      ]);
      expect(maxConcurrent).toBe(1); // Only 1 at a time
    });
  });
});
