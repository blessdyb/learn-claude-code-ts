# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TS version of https://learn.shareai.run/en/ - A TypeScript-based coding agent system that uses the Anthropic API with Ollama backend.

The project is a single-file CLI application that implements an interactive coding agent loop. The agent receives user prompts, executes bash commands as tools, and maintains conversation history across turns.

## Architecture

### Core Flow

```
user input → append to history → agent.messages.create()
  ↓
if tool_use: spawn bash command → capture output
  ↓
append result to history → loop continues
  ↓
else (text response): display and break loop
```

### Key Components

1. **`src/s01_agent_loop.ts`** - Main entry point implementing:
   - Anthropic SDK client initialization with configurable model/endpoint
   - System prompt setup (`process.cwd()` as agent location)
   - Interactive CLI using `readline/promises`
   - Conversation loop with message history management
   - Tool use detection and response rendering

2. **`src/mini_shell.ts`** - Custom bash tool implementation:
   - Command parsing without shell injection vulnerabilities
   - Pipeline support (`|`, `&&`) for multi-step commands
   - Heredoc (`<<`) and file redirection (`>`, `>>`) handling
   - 120s timeout via child_process spawn
   - Process chaining with proper stdout/stderr piping

3. **Configuration**:
   - `.env` loaded via `dotenv` for API keys and settings
   - `tsconfig.json` with ES2022 target, module resolution, source maps

## File Structure

```
src/
  s01_agent_loop.ts    # Main agent loop (single-file implementation)
  mini_shell.ts        # Bash tool wrapper (separate for modularity)
dist/                  # Compiled JavaScript output
.env                   # Environment configuration (gitignored)
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript in `dist/` |
| `npm run start` | Run compiled JavaScript from dist/ |
| `npm run dev` | Build and watch for hot-reload development |
| `npm test` | Test runner (currently placeholder, add jest/vitest later) |

## Configuration

### Environment Variables (.env)

Required before first run:

```env
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=http://localhost:11434
ANTHROPIC_MODEL=qwen3.5:9b
```

- `ANTHROPIC_API_KEY` - API key for authentication (can be "ollama" for local)
- `ANTHROPIC_BASE_URL` - Base URL for API calls (default: http://localhost:11434)
- `ANTHROPIC_MODEL` - Model to use (default: qwen3.5:9b)

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "outDir": "./dist",
  "rootDir": "./src",
  "strict": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true,
  "resolveJsonModule": true,
  "declaration": true,
  "declarationMap": true,
  "sourceMap": true
}
```

Build outputs TypeScript declaration files and source maps in `dist/`.

## Agent Behavior

### System Prompt

The agent's system prompt is:
```
You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.
```

### Available Tools

Only one tool is registered with the Anthropic API:
- **`bash`**: Execute shell commands. The `command` property contains the full command string.

### Agent Loop Termination

The loop terminates when:
1. API returns a non-tool response (text content)
2. An error occurs during API call or command execution
3. User enters `q` or `exit` command

## Development Workflow

1. **Setup**: Create `.env` with required API configuration
2. **Edit**: Modify `src/s01_agent_loop.ts` for agent logic changes
3. **Run**: Use `npm run dev` for hot-reload development OR `npm run build && npm start` for production runs
4. **Debug**: Add `console.log()` before `agentProcess()` to inspect message history

## Agent Loop Details

### Message History Structure

```typescript
type Message = {
  role: "user" | "assistant";
  content: string | any[]; // tool_results as array, plain text otherwise
};
```

### Tool Use Handling

When the agent requests a bash command:
1. Parse `response.content` for tool_use blocks
2. Extract `command` from `(block as any).input.command`
3. Execute via `runBash(command)` and capture output
4. Build tool_result array and append to messages as user role

### Output Truncation

Command output is limited to 200 characters (`output.slice(0, 200)`) before being sent back to the agent.

## Security Considerations

The `mini_shell.ts` implementation includes:
- Command tokenization that avoids shell injection
- Pipeline splitting outside quotes for safe command chaining
- Spawn process with explicit stdio pipes (no inheritance of harmful environment)
- Exit code validation with stderr capture on failure

## Adding New Features

### Extending the Agent

To add more tools or capabilities:
1. Modify `TOOLS` array in `s01_agent_loop.ts` to register new tools
2. Add corresponding tool functions imported from separate modules
3. Ensure each tool returns properly formatted results for the agent

### Customizing System Prompt

The SYSTEM template uses `process.cwd()` dynamically. To change:
- Modify line 18: `SYSTEM = \`You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.\`;`
