import fs from 'node:fs';
import path from 'node:path';

interface SandboxConfig {
  sandboxDir: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LINES = 10000;

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

export function createFileReader(config: SandboxConfig) {
  const sandboxDir = path.resolve(config.sandboxDir);

  function validatePath(requestedPath: string): string {
    const resolvedPath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(path.join(sandboxDir, requestedPath));

    const normalizedResolved = path.normalize(resolvedPath);
    const sandboxDirNormalized = path.normalize(sandboxDir);

    if (!normalizedResolved.startsWith(sandboxDirNormalized)) {
      throw new FileReadError(
        `Access denied: File path must be within sandbox directory ${sandboxDir}`
      );
    }

    const normalizedRequested = path.normalize(requestedPath);
    if (normalizedRequested.includes('..')) {
      throw new FileReadError(
        `Access denied: Path traversal not allowed`
      );
    }

    return normalizedResolved;
  }

  async function readFile(
    args: { path: string; limit?: number }
  ): Promise<string> {
    const { path: filePath, limit = MAX_LINES } = args;

    if (!filePath) {
      throw new FileReadError('File path is required');
    }

    if (typeof filePath !== 'string') {
      throw new FileReadError('File path must be a string');
    }

    if (filePath.length > 1000) {
      throw new FileReadError('File path too long');
    }

    const resolvedPath = validatePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new FileReadError(`File not found: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      throw new FileReadError('Path is a directory, not a file');
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new FileReadError(
        `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`
      );
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length > limit) {
      const truncated = [
        ...lines.slice(0, limit),
        `... (${lines.length - limit} more lines)`,
      ];
      return truncated.join('\n');
    }

    return content;
  }

  return {
    validatePath,
    read: readFile,
  };
}
