import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileWriteError, createFileWriter } from '../../tools/write_file.js';

describe('FileWriter', () => {
  let tempDir: string;
  let writer: ReturnType<typeof createFileWriter>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
    writer = createFileWriter({ sandboxDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should accept files within sandbox', () => {
      const result = writer.validatePath('test.txt');
      expect(result).toBe(path.join(tempDir, 'test.txt'));
    });

    it('should accept absolute paths within sandbox', () => {
      const absPath = path.join(tempDir, 'nested', 'file.txt');
      const result = writer.validatePath(absPath);
      expect(result).toBe(absPath);
    });

    it('should accept relative paths with subdirectories', () => {
      const result = writer.validatePath('subdir/file.txt');
      expect(result).toBe(path.join(tempDir, 'subdir', 'file.txt'));
    });

    it('should reject path traversal attempts', () => {
      expect(() => writer.validatePath('../etc/passwd')).toThrow('within sandbox');
      expect(() => writer.validatePath('foo/../../etc/passwd')).toThrow('within sandbox');
    });

    it('should reject paths outside sandbox', () => {
      const outsidePath = '/etc/passwd';
      expect(() => writer.validatePath(outsidePath)).toThrow('within sandbox');
    });
  });

  describe('write', () => {
    it('should write a simple file', async () => {
      const result = await writer.write({ path: 'simple.txt', content: 'Hello, World!' });

      expect(result).toContain('Successfully wrote');
      expect(result).toContain(tempDir);

      const content = fs.readFileSync(path.join(tempDir, 'simple.txt'), 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    it('should create parent directories automatically', async () => {
      const result = await writer.write({ path: 'deep/nested/dir/file.txt', content: 'nested content' });

      expect(result).toContain('Successfully wrote');

      const filePath = path.join(tempDir, 'deep/nested/dir/file.txt');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('nested content');
    });

    it('should overwrite existing file', async () => {
      const existingPath = path.join(tempDir, 'existing.txt');
      fs.writeFileSync(existingPath, 'old content', 'utf-8');

      const result = await writer.write({ path: 'existing.txt', content: 'new content' });

      expect(result).toContain('Successfully wrote');

      const content = fs.readFileSync(existingPath, 'utf-8');
      expect(content).toBe('new content');
    });

    it('should handle empty content', async () => {
      const result = await writer.write({ path: 'empty.txt', content: '' });

      expect(result).toContain('Successfully wrote');

      const filePath = path.join(tempDir, 'empty.txt');
      const stats = fs.statSync(filePath);
      expect(stats.size).toBe(0);
    });

    it('should handle content with newlines', async () => {
      const content = 'line1\nline2\nline3\n';
      const result = await writer.write({ path: 'multiline.txt', content });

      const filePath = path.join(tempDir, 'multiline.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should handle content with special characters', async () => {
      const content = 'Hello\nWorld\n\nSpecial: ñ, é, 中文，日本語';
      const result = await writer.write({ path: 'special.txt', content });

      const filePath = path.join(tempDir, 'special.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });
  });

  describe('error handling', () => {
    it('should throw when path is missing', async () => {
      await expect((writer.write({ path: '' as any, content: 'test' }) as Promise<any>)).rejects.toThrow('File path is required');
    });

    it('should throw when path is not a string', async () => {
      await expect((writer.write({ path: 123 as any, content: 'test' }) as Promise<any>)).rejects.toThrow('File path must be a string');
    });

    it('should throw when content is missing', async () => {
      await expect((writer.write({ path: 'test.txt', content: undefined as any } as any) as Promise<any>)).rejects.toThrow('Content is required');
    });

    it('should throw when content is not a string', async () => {
      await expect((writer.write({ path: 'test.txt', content: 123 as any } as any) as Promise<any>)).rejects.toThrow('Content must be a string');
    });

    it('should throw when content is too large', async () => {
      const largeContent = 'x'.repeat(101 * 1024); // 101KB
      await expect(writer.write({ path: 'large.txt', content: largeContent })).rejects.toThrow('Content too large');
    });

    it('should throw when path is too long', async () => {
      await expect(writer.write({ path: 'a'.repeat(1001), content: 'test' })).rejects.toThrow('File path too long');
    });

    it('should throw on path traversal attempt', async () => {
      await expect(writer.write({ path: '../etc/passwd', content: 'malicious' })).rejects.toThrow('within sandbox');
    });

    it('should throw on path outside sandbox', async () => {
      await expect(writer.write({ path: '/etc/passwd', content: 'malicious' })).rejects.toThrow('within sandbox');
    });
  });

  describe('edge cases', () => {
    it('should handle very long single line', async () => {
      const content = 'a'.repeat(90 * 1024); // 90KB
      const result = await writer.write({ path: 'longline.txt', content });

      expect(result).toContain('Successfully wrote');
      const filePath = path.join(tempDir, 'longline.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should handle binary-like content', async () => {
      const content = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString('utf-8');
      const result = await writer.write({ path: 'binary.txt', content });

      expect(result).toContain('Successfully wrote');
      const filePath = path.join(tempDir, 'binary.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should preserve exact byte count', async () => {
      const content = 'Hello, World!';
      const result = await writer.write({ path: 'test.txt', content });

      expect(result).toContain(`${content.length} bytes`);
      const filePath = path.join(tempDir, 'test.txt');
      const stats = fs.statSync(filePath);
      expect(stats.size).toBe(content.length);
    });

    it('should handle Windows-style line endings', async () => {
      const content = 'line1\r\nline2\r\nline3';
      const result = await writer.write({ path: 'windows.txt', content });

      const filePath = path.join(tempDir, 'windows.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('should handle file with only null bytes', async () => {
      const content = '\0\0\0\0\0';
      const result = await writer.write({ path: 'nulls.txt', content });

      expect(result).toContain('Successfully wrote');
      const filePath = path.join(tempDir, 'nulls.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(content);
    });
  });

  describe('concurrent writes', () => {
    it('should handle concurrent writes to different files', async () => {
      const promises = [
        writer.write({ path: 'file1.txt', content: 'content1' }),
        writer.write({ path: 'file2.txt', content: 'content2' }),
        writer.write({ path: 'file3.txt', content: 'content3' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(fs.existsSync(path.join(tempDir, 'file1.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'file2.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'file3.txt'))).toBe(true);
    });

    it('should handle concurrent writes to same file', async () => {
      // Last write wins due to synchronous fs.writeFileSync
      const results = await Promise.all([
        writer.write({ path: 'same.txt', content: 'first' }),
        writer.write({ path: 'same.txt', content: 'second' }),
        writer.write({ path: 'same.txt', content: 'third' }),
      ]);

      const filePath = path.join(tempDir, 'same.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe('third');
    });
  });
});
