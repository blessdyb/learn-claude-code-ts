import fs from 'node:fs';
import path from 'node:path';

interface SandboxConfig {
  sandboxDir: string;
}

const MAX_CONTENT_LENGTH = 100 * 1024; // 100KB per write

export class FileWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileWriteError';
  }
}

export function createFileWriter(config: SandboxConfig) {
  const sandboxDir = path.resolve(config.sandboxDir);

  function validatePath(requestedPath: string): string {
    const resolvedPath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(path.join(sandboxDir, requestedPath));

    const normalizedResolved = path.normalize(resolvedPath);
    const sandboxDirNormalized = path.normalize(sandboxDir);

    if (!normalizedResolved.startsWith(sandboxDirNormalized)) {
      throw new FileWriteError(
        `Access denied: File path must be within sandbox directory ${sandboxDir}`
      );
    }

    const normalizedRequested = path.normalize(requestedPath);
    if (normalizedRequested.includes('..')) {
      throw new FileWriteError(
        `Access denied: Path traversal not allowed`
      );
    }

    return normalizedResolved;
  }

  async function writeFile(
    args: { path: string; content: string }
  ): Promise<string> {
    const { path: filePath, content } = args;

    if (!filePath) {
      throw new FileWriteError('File path is required');
    }

    if (typeof filePath !== 'string') {
      throw new FileWriteError('File path must be a string');
    }

    if (filePath.length > 1000) {
      throw new FileWriteError('File path too long');
    }

    if (content === undefined || content === null) {
      throw new FileWriteError('Content is required');
    }

    if (typeof content !== 'string') {
      throw new FileWriteError('Content must be a string');
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      throw new FileWriteError(
        `Content too large: ${content.length} bytes (max ${MAX_CONTENT_LENGTH})`
      );
    }

    const resolvedPath = validatePath(filePath);

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content, 'utf-8');

    const stats = fs.statSync(resolvedPath);

    return `Successfully wrote ${stats.size} bytes to ${resolvedPath}`;
  }

  return {
    validatePath,
    write: writeFile,
  };
}
