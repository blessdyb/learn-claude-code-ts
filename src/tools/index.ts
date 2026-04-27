import { runBash } from './bash.js';
import { createFileReader } from './read_file.js';
import { createFileWriter } from './write_file.js';
import { createFileEditor } from './edit_file.js';

export { runBash };
export { createFileReader, createFileWriter, createFileEditor };

const SANDBOX_DIR = process.env['SANDBOX_DIR'] || process.cwd();

export const fileReader = createFileReader({ sandboxDir: SANDBOX_DIR });
export const fileWriter = createFileWriter({ sandboxDir: SANDBOX_DIR });
export const fileEditor = createFileEditor({ sandboxDir: SANDBOX_DIR });
