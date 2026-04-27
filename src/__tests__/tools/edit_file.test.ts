import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileEditError, createFileEditor } from '../../tools/edit_file.js';

describe('FileEditor', () => {
  let tempDir: string;
  let editor: ReturnType<typeof createFileEditor>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    editor = createFileEditor({ sandboxDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should accept files within sandbox', () => {
      const result = editor.validatePath('test.txt');
      expect(result).toBe(path.join(tempDir, 'test.txt'));
    });

    it('should accept absolute paths within sandbox', () => {
      const absPath = path.join(tempDir, 'nested', 'file.txt');
      const result = editor.validatePath(absPath);
      expect(result).toBe(absPath);
    });

    it('should accept relative paths with subdirectories', () => {
      const result = editor.validatePath('subdir/file.txt');
      expect(result).toBe(path.join(tempDir, 'subdir', 'file.txt'));
    });

    it('should reject path traversal attempts', () => {
      expect(() => editor.validatePath('../etc/passwd')).toThrow('within sandbox');
      expect(() => editor.validatePath('foo/../../etc/passwd')).toThrow('within sandbox');
    });

    it('should reject paths outside sandbox', () => {
      const outsidePath = '/etc/passwd';
      expect(() => editor.validatePath(outsidePath)).toThrow('within sandbox');
    });
  });

  describe('validateOperation', () => {
    it('should accept valid operation', () => {
      expect(() => editor.validateOperation('old', 'new')).not.toThrow();
    });

    it('should throw when old_text is empty', () => {
      expect(() => editor.validateOperation('', 'new')).toThrow('old_text');
    });

    it('should allow empty new_text', () => {
      expect(() => editor.validateOperation('old', '')).not.toThrow();
    });

    it('should throw when operation is too large', () => {
      const largeOp = 'x'.repeat(60 * 1024);
      expect(() => editor.validateOperation(largeOp, largeOp)).toThrow('Operation too large');
    });
  });

  describe('edit', () => {
    it('should replace text in file', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      const result = await editor.edit({
        path: 'test.txt',
        old_text: 'World',
        new_text: 'Universe',
      });

      expect(result).toContain('Successfully edited');

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hello Universe');
    });

    it('should replace text with exact match', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      const result = await editor.edit({
        path: 'test.txt',
        old_text: 'Hello World',
        new_text: 'Hi Universe',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hi Universe');
    });

    it('should preserve surrounding content', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'prefix Hello World suffix', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'Hello World',
        new_text: 'Hi Universe',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('prefix Hi Universe suffix');
    });

    it('should handle multiline old_text', async () => {
      const content = 'line1\nHello\nWorld\nline4';
      fs.writeFileSync(path.join(tempDir, 'test.txt'), content, 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'Hello\nWorld',
        new_text: 'Hi\nUniverse',
      });

      const written = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(written).toBe('line1\nHi\nUniverse\nline4');
    });

    it('should handle empty replacement', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: ' World',
        new_text: '',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hello');
    });

    it('should handle large replacement', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'replace me', 'utf-8');

      const newContent = 'a'.repeat(40 * 1024);
      await editor.edit({
        path: 'test.txt',
        old_text: 'replace me',
        new_text: newContent,
      });

      const written = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(written).toBe(newContent);
    });

    it('should handle multiline replacement', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'single', 'utf-8');

      const newContent = 'line1\nline2\nline3\nline4';
      await editor.edit({
        path: 'test.txt',
        old_text: 'single',
        new_text: newContent,
      });

      const written = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(written).toBe(newContent);
    });
  });

  describe('error handling', () => {
    it('should throw when path is missing', async () => {
      await expect((editor.edit({ path: '' as any, old_text: 'a', new_text: 'b' } as any) as Promise<any>)).rejects.toThrow('File path is required');
    });

    it('should throw when path is not a string', async () => {
      await expect((editor.edit({ path: 123 as any, old_text: 'a', new_text: 'b' } as any) as Promise<any>)).rejects.toThrow('File path must be a string');
    });

    it('should throw when file does not exist', async () => {
      await expect(editor.edit({ path: 'nonexistent.txt', old_text: 'a', new_text: 'b' })).rejects.toThrow('File not found');
    });

    it('should throw when path is a directory', async () => {
      const dirPath = path.join(tempDir, 'mydir');
      fs.mkdirSync(dirPath);

      await expect(editor.edit({ path: 'mydir', old_text: 'a', new_text: 'b' })).rejects.toThrow('directory');
    });

    it('should throw when file is too large', async () => {
      const filePath = path.join(tempDir, 'huge.txt');
      fs.writeFileSync(filePath, 'x'.repeat(11 * 1024 * 1024), 'utf-8');

      await expect(editor.edit({ path: 'huge.txt', old_text: 'a', new_text: 'b' })).rejects.toThrow('File too large');
    });

    it('should throw when old_text not found', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      await expect(editor.edit({ path: 'test.txt', old_text: 'XYZ', new_text: 'ABC' })).rejects.toThrow('old_text not found');
    });

    it('should handle partial substring match', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      const result = await editor.edit({ path: 'test.txt', old_text: 'Hello', new_text: 'Hi' });
      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');

      expect(content).toBe('Hi World');
      expect(result).toContain('Successfully edited');
    });

    it('should throw when path is too long', async () => {
      await expect(editor.edit({ path: 'a'.repeat(1001), old_text: 'a', new_text: 'b' })).rejects.toThrow('File path too long');
    });

    it('should throw on path traversal attempt', async () => {
      await expect(editor.edit({ path: '../etc/passwd', old_text: 'root:x', new_text: 'hack' })).rejects.toThrow('within sandbox');
    });

    it('should throw on path outside sandbox', async () => {
      await expect(editor.edit({ path: '/etc/passwd', old_text: 'root:x', new_text: 'hack' })).rejects.toThrow('within sandbox');
    });
  });

  describe('edge cases', () => {
    it('should handle file with no trailing newline', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'World',
        new_text: 'Universe',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hello Universe');
    });

    it('should handle special characters in text', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello ñ é 中文', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'ñ',
        new_text: 'a',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hello a é 中文');
    });

    it('should handle text with regex special characters', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello $world {test} [pattern]', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: '$world {test} [pattern]',
        new_text: 'universe',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hello universe');
    });

    it('should handle text with backslashes', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'path\\to\\file', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'to',
        new_text: 'from',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('path\\from\\file');
    });

    it('should handle tab characters', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'before\tafter', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: '\t',
        new_text: ' | ',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('before | after');
    });

    it('should handle multiple occurrences - replaces first match only', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'Hello World, Hello Universe', 'utf-8');

      await editor.edit({
        path: 'test.txt',
        old_text: 'Hello',
        new_text: 'Hi',
      });

      const content = fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8');
      expect(content).toBe('Hi World, Hello Universe');
    });

    it('should handle empty file with error', async () => {
      fs.writeFileSync(path.join(tempDir, 'empty.txt'), '', 'utf-8');

      await expect(editor.edit({ path: 'empty.txt', old_text: 'a', new_text: 'b' })).rejects.toThrow('old_text not found');
    });

    it('should preserve file permissions', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'content', 'utf-8');
      fs.chmodSync(filePath, 0o644);

      await editor.edit({
        path: 'test.txt',
        old_text: 'content',
        new_text: 'new content',
      });

      const stats = fs.statSync(filePath);
      expect(stats.mode & 0o777).toBe(0o644);
    });
  });

  describe('concurrent edits', () => {
    it('should handle concurrent edits to different files', async () => {
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'original1', 'utf-8');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'original2', 'utf-8');

      const results = await Promise.all([
        editor.edit({ path: 'file1.txt', old_text: 'original1', new_text: 'modified1' }),
        editor.edit({ path: 'file2.txt', old_text: 'original2', new_text: 'modified2' }),
      ]);

      expect(results).toHaveLength(2);
      expect(fs.readFileSync(path.join(tempDir, 'file1.txt'), 'utf-8')).toBe('modified1');
      expect(fs.readFileSync(path.join(tempDir, 'file2.txt'), 'utf-8')).toBe('modified2');
    });

    it('should handle concurrent edits to same file - last write wins', async () => {
      fs.writeFileSync(path.join(tempDir, 'same.txt'), 'original', 'utf-8');

      // Only one can succeed since they all look for 'original'
      const results = await Promise.allSettled([
        editor.edit({ path: 'same.txt', old_text: 'original', new_text: 'first' }),
        editor.edit({ path: 'same.txt', old_text: 'original', new_text: 'second' }),
        editor.edit({ path: 'same.txt', old_text: 'original', new_text: 'third' }),
      ]);

      // At least one should succeed
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      const filePath = path.join(tempDir, 'same.txt');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(['first', 'second', 'third']).toContain(written);
    });
  });
});
