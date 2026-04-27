import fs from 'node:fs';
import path from 'node:path';

interface SandboxConfig {
  sandboxDir: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_OPERATION_SIZE = 50 * 1024; // 50KB

export class FileEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileEditError';
  }
}

export function createFileEditor(config: SandboxConfig) {
  const sandboxDir = path.resolve(config.sandboxDir);

  function validatePath(requestedPath: string): string {
    const resolvedPath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(path.join(sandboxDir, requestedPath));

    const normalizedResolved = path.normalize(resolvedPath);
    const sandboxDirNormalized = path.normalize(sandboxDir);

    if (!normalizedResolved.startsWith(sandboxDirNormalized)) {
      throw new FileEditError(
        `Access denied: File path must be within sandbox directory ${sandboxDir}`
      );
    }

    const normalizedRequested = path.normalize(requestedPath);
    if (normalizedRequested.includes('..')) {
      throw new FileEditError(
        `Access denied: Path traversal not allowed`
      );
    }

    return normalizedResolved;
  }

  function validateOperation(oldText: string, newText: string): void {
    const totalSize = oldText.length + newText.length;

    if (totalSize > MAX_OPERATION_SIZE) {
      throw new FileEditError(
        `Operation too large: ${totalSize} bytes (max ${MAX_OPERATION_SIZE})`
      );
    }

    if (!oldText) {
      throw new FileEditError('old_text is required and cannot be empty');
    }
  }

  async function editFile(
    args: { path: string; old_text: string; new_text: string }
  ): Promise<string> {
    const { path: filePath, old_text, new_text } = args;

    if (!filePath) {
      throw new FileEditError('File path is required');
    }

    if (typeof filePath !== 'string') {
      throw new FileEditError('File path must be a string');
    }

    if (filePath.length > 1000) {
      throw new FileEditError('File path too long');
    }

    validateOperation(old_text, new_text);

    const resolvedPath = validatePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new FileEditError(`File not found: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      throw new FileEditError('Path is a directory, not a file');
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new FileEditError(
        `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`
      );
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');

    const exactMatchIndex = content.indexOf(old_text);

    if (exactMatchIndex === -1) {
      throw new FileEditError(
        `old_text not found in file. Expected exact match.`
      );
    }

    const newContent =
      content.slice(0, exactMatchIndex) +
      new_text +
      content.slice(exactMatchIndex + old_text.length);

    fs.writeFileSync(resolvedPath, newContent, 'utf-8');

    return `Successfully edited file. Replaced 1 occurrence of ${old_text.length} chars with ${new_text.length} chars`;
  }

  return {
    validatePath,
    validateOperation,
    edit: editFile,
  };
}
