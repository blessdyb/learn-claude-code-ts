import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileReadError, createFileReader } from '../../tools/read_file.js';

describe('FileReader', () => {
  let tempDir: string;
  let reader: ReturnType<typeof createFileReader>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-test-'));
    reader = createFileReader({ sandboxDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should accept files within sandbox', () => {
      const result = reader.validatePath('test.txt');
      expect(result).toBe(path.join(tempDir, 'test.txt'));
    });

    it('should accept absolute paths within sandbox', () => {
      const absPath = path.join(tempDir, 'nested', 'file.txt');
      const result = reader.validatePath(absPath);
      expect(result).toBe(absPath);
    });

    it('should accept relative paths with subdirectories', () => {
      const result = reader.validatePath('subdir/file.txt');
      expect(result).toBe(path.join(tempDir, 'subdir', 'file.txt'));
    });

    it('should reject path traversal attempts', () => {
      expect(() => reader.validatePath('../etc/passwd')).toThrow('within sandbox');
      expect(() => reader.validatePath('foo/../../etc/passwd')).toThrow('within sandbox');
    });

    it('should reject paths outside sandbox', () => {
      const outsidePath = '/etc/passwd';
      expect(() => reader.validatePath(outsidePath)).toThrow('within sandbox');
    });
  });

  describe('read', () => {
    it('should read a simple file', async () => {
      const filePath = path.join(tempDir, 'simple.txt');
      fs.writeFileSync(filePath, 'Hello, World!', 'utf-8');

      const result = await reader.read({ path: 'simple.txt' });
      expect(result).toBe('Hello, World!');
    });

    it('should read file with limit', async () => {
      const filePath = path.join(tempDir, 'multiline.txt');
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`);
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const result = await reader.read({ path: 'multiline.txt', limit: 10 });
      expect(result.split('\n').length).toBe(11); // 10 + 1 for truncation message
      expect(result).toContain('...');
    });

    it('should truncate files exceeding max lines', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      const lines = Array.from({ length: 15000 }, (_, i) => `Line ${i}`);
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const result = await reader.read({ path: 'large.txt', limit: 1000 });
      expect(result).toContain('... (14000 more lines)');
    });

    it('should handle files without trailing newline', async () => {
      const filePath = path.join(tempDir, 'no-newline.txt');
      fs.writeFileSync(filePath, 'No trailing newline', 'utf-8');

      const result = await reader.read({ path: 'no-newline.txt' });
      expect(result).toBe('No trailing newline');
    });

    it('should read binary-like content as string', async () => {
      const filePath = path.join(tempDir, 'binary.txt');
      fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02]).toString('utf-8'), 'utf-8');

      const result = await reader.read({ path: 'binary.txt' });
      expect(result).toBe('\u0000\u0001\u0002');
    });
  });

  describe('error handling', () => {
    it('should throw when path is missing', async () => {
      await expect(reader.read({ path: '' as any })).rejects.toThrow('File path is required');
    });

    it('should throw when path is not a string', async () => {
      await expect((reader.read({ path: 123 as any }) as Promise<any>)).rejects.toThrow('File path must be a string');
    });

    it('should throw when file does not exist', async () => {
      await expect(reader.read({ path: 'nonexistent.txt' })).rejects.toThrow('File not found');
    });

    it('should throw when path is a directory', async () => {
      const dirPath = path.join(tempDir, 'mydir');
      fs.mkdirSync(dirPath);

      await expect(reader.read({ path: 'mydir' })).rejects.toThrow('directory');
    });

    it('should throw when file is too large', async () => {
      const filePath = path.join(tempDir, 'huge.txt');
      fs.writeFileSync(filePath, 'x'.repeat(11 * 1024 * 1024), 'utf-8'); // 11MB

      await expect(reader.read({ path: 'huge.txt' })).rejects.toThrow('File too large');
    });

    it('should throw when path is too long', async () => {
      const longPath = 'a'.repeat(1001);
      await expect(reader.read({ path: longPath })).rejects.toThrow('File path too long');
    });

    it('should reject path traversal via relative parent', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content', 'utf-8');
      // path.join will resolve correctly but validatePath should catch the ..
      expect(() => reader.validatePath('../test.txt')).toThrow('within sandbox');
    });
  });

  describe('edge cases', () => {
    it('should handle empty file', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      fs.writeFileSync(filePath, '', 'utf-8');

      const result = await reader.read({ path: 'empty.txt' });
      expect(result).toBe('');
    });

    it('should handle file with only whitespace', async () => {
      const filePath = path.join(tempDir, 'whitespace.txt');
      fs.writeFileSync(filePath, '   \n  \n\t\t', 'utf-8');

      const result = await reader.read({ path: 'whitespace.txt' });
      expect(result).toBe('   \n  \n\t\t');
    });

    it('should handle file with special characters', async () => {
      const filePath = path.join(tempDir, 'special.txt');
      const content = 'Hello\nWorld\n\nSpecial: ñ, é, 中文';
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = await reader.read({ path: 'special.txt' });
      expect(result).toBe(content);
    });

    it('should handle very long single line', async () => {
      const filePath = path.join(tempDir, 'longline.txt');
      const content = 'a'.repeat(50000);
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = await reader.read({ path: 'longline.txt', limit: 100 });
      expect(result).toBe(content);
    });

    it('should handle limit of 0', async () => {
      const filePath = path.join(tempDir, 'lines.txt');
      fs.writeFileSync(filePath, 'line1\nline2\nline3\n', 'utf-8');

      const result = await reader.read({ path: 'lines.txt', limit: 0 });
      expect(result).toContain('...');
    });
  });
});
