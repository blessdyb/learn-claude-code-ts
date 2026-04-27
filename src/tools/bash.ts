import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'sudo',
  'shutdown',
  'reboot',
  '> /dev/',
];

const TIMEOUT_MS = 120000; // 120 seconds

export async function runBash(cmd: string): Promise<string> {
  const chains = splitOutsideQuotes(cmd, '&&');

  for (const c of chains) {
    const trimmed = c.trim();
    // Check for dangerous commands
    if (DANGEROUS_COMMANDS.some((dangerous) => trimmed.includes(dangerous))) {
      return 'Error: Dangerous command blocked';
    }
  }

  let result = '';

  for (const c of chains) {
    result = await runPipeline(c.trim());
  }

  return result;
}

async function runPipeline(cmd: string): Promise<string> {
  const parts = splitOutsideQuotes(cmd, '|');

  const processes: ChildProcess[] = [];

  let heredocInput: string | null = null;

  for (const part of parts) {
    const parsed = parseCommand(part.trim());

    const child = spawn(parsed.cmd, parsed.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    if (parsed.redirect) {
      const stream = fs.createWriteStream(parsed.redirect.file, {
        flags: parsed.redirect.append ? 'a' : 'w',
      });

      child.stdout.pipe(stream);
    }

    if (parsed.heredoc) {
      heredocInput = parsed.heredoc;
      child.stdin.write(heredocInput);
      child.stdin.end();
    }

    processes.push(child);
  }

  for (let i = 0; i < processes.length - 1; i++) {
    processes[i].stdout!.pipe(processes[i + 1].stdin!);
  }

  const last = processes[processes.length - 1]!;

  let stdout = '';
  let stderr = '';

  last.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
  last.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));

  const timeoutId = setTimeout(() => {
    processes.forEach((p) => p.kill());
  }, TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const timeoutHandler = () => {
      clearTimeout(timeoutId);
      reject(new Error('Error: Timeout (120s)'));
    };

    last.on('close', (code: number) => {
      clearTimeout(timeoutId);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `exit ${code}`));
    });

    last.on('error', timeoutHandler);
  });
}

function parseCommand(cmdline: string) {
  let redirect = null;
  let heredoc = null;

  // heredoc
  const heredocMatch = cmdline.match(/<<\s*'?(\w+)'?/);

  if (heredocMatch) {
    const delimiter = heredocMatch[1];

    const lines = cmdline.split('\n');
    const body: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === delimiter) break;
      body.push(lines[i]);
    }

    heredoc = body.join('\n') + '\n';

    cmdline = lines[0].replace(/<<.*$/, '').trim();
  }

  // redirect >
  const redirectMatch = cmdline.match(/(>>?)\s*(\S+)/);

  if (redirectMatch) {
    redirect = {
      append: redirectMatch[1] === '>>',
      file: redirectMatch[2],
    };

    cmdline = cmdline.replace(/(>>?)\s*\S+/, '').trim();
  }

  const tokens = tokenize(cmdline);

  return {
    cmd: tokens[0],
    args: tokens.slice(1),
    redirect,
    heredoc,
  };
}

function tokenize(input: string): string[] {
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;

  const tokens: string[] = [];

  let match;

  while ((match = re.exec(input))) {
    tokens.push(match[1] || match[2] || match[0]);
  }

  return tokens;
}

function splitOutsideQuotes(str: string, delimiter: string): string[] {
  const result: string[] = [];

  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (c === '"' || c === "'") {
      quote = quote === c ? null : c;
    }

    if (!quote && str.slice(i, i + delimiter.length) === delimiter) {
      result.push(current);
      current = '';
      i += delimiter.length - 1;
      continue;
    }

    current += c;
  }

  result.push(current);

  return result;
}
