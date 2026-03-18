# Coding Agent CLI

A TypeScript-based coding agent system that uses the Anthropic API with Ollama backend. The agent receives natural language prompts and executes bash commands to solve tasks interactively.

## Quick Start

### Prerequisites

- Node.js 18+
- Ollama running locally (or an Anthropic API key for cloud)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with configuration:
   ```env
   ANTHROPIC_API_KEY=ollama  # or your actual API key
   ANTHROPIC_BASE_URL=http://localhost:11434
   ANTHROPIC_MODEL=qwen3.5:9b
   ```

### Running

**Development mode** (hot-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

## Usage

After starting the application, you'll see an interactive prompt:

```
s01 >>
```

Enter any coding task description. The agent will:
- Parse your request
- Execute necessary bash commands
- Present results and suggestions
- Continue until a complete response is generated

Example tasks:
```
Create a hello world file and show me the output
Set up a Node.js server that listens on port 3000
Explain what files are in this directory
```

Type `q` or `exit` to quit.

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

### File Structure

```
src/
  s01_agent_loop.ts    # Main agent loop (single-file implementation)
  mini_shell.ts        # Bash tool wrapper (separate for modularity)
dist/                  # Compiled JavaScript output
.env                   # Environment configuration (gitignored)
```

## Configuration

### Environment Variables (.env)

- `ANTHROPIC_API_KEY` - API key for authentication (can be "ollama" for local)
- `ANTHROPIC_BASE_URL` - Base URL for API calls (default: http://localhost:11434)
- `ANTHROPIC_MODEL` - Model to use (default: qwen3.5:9b)

### TypeScript Configuration (`tsconfig.json`)

Uses ES2022 target with ESNext modules, source maps, and declaration files for type support.

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript in `dist/` |
| `npm run start` | Run compiled JavaScript from dist/ |
| `npm run dev` | Build and watch for hot-reload development |
| `npm test` | Test runner (placeholder - add tests later) |

## Agent Behavior

The agent operates with these constraints:
- **System Prompt**: Sets working directory context
- **Available Tool**: Only `bash` command execution
- **Output Limit**: Command results truncated to 200 chars before returning to agent
- **Termination**: Stops on text response, error, or `q`/`exit` input

## Development Workflow

1. Edit source in `src/s01_agent_loop.ts`
2. Run `npm run dev` for hot-reload development
3. Or build with `npm run build` then run with `npm start`

## Common Tasks

### Building the Project
```bash
npm run build
```

### Running a Single Test Command
Since there's no test framework yet, you can add Jest/Vitest later:
```bash
# Add test framework first
npm install --save-dev jest
# Update package.json scripts and add tests in __tests__/
```

## Security Notes

The custom shell implementation avoids shell injection by:
- Tokenizing commands outside quotes for splitting
- Validating exit codes
- Not inheriting dangerous environment variables

## See Also

- [CLAUDE.md](./CLAUDE.md) - Detailed development guide for Claude Code
- [Original Project](https://learn.shareai.run/en/)
