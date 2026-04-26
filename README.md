# Coding Agent CLI

A model-agnostic TypeScript-based coding agent that works with multiple LLM providers (OpenAI, Anthropic). The agent receives natural language prompts, executes bash commands using function calling, and provides results interactively.

## Features

✨ **Model Agnostic** - Seamlessly switch between OpenAI and Anthropic with a single environment variable  
🔧 **Tool System** - Built-in bash execution with support for pipes, chaining, redirects, and heredoc syntax  
💻 **Interactive CLI** - Real-time conversation with streaming command output  
📁 **Clean Architecture** - Separated concerns with models, tools, and agent logic  
🚀 **TypeScript** - Full type safety with modern async/await patterns  

## Quick Start

### Prerequisites

- Node.js 18+
- API keys for your preferred LLM provider (OpenAI, Anthropic, or local Ollama)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file from example:**
   ```bash
   cp .env.example .env
   ```

3. **Configure `.env` with your credentials:**
   - For OpenAI: Add your `OPENAI_API_KEY` and set `MODEL_PROVIDER=openai`
   - For Anthropic: Add your `ANTHROPIC_API_KEY` and set `MODEL_PROVIDER=anthropic`

   See [.env.example](.env.example) for all available configuration options and examples.

### Running

**Default (OpenAI):**
```bash
npm run start
```

**With Anthropic:**
```bash
npm run start:anthropic
```

**Development mode** (watch TypeScript compilation):
```bash
npm run dev
```

## Usage Examples

Start the agent and interact with natural language prompts:

```
[openai] >> list all files in current directory with timestamps
$ ls -la
total 456
drwxr-xr-x  12 user  staff   384 Apr 26 12:09 .
...

[openai] >> create a file with "hello world"
$ cat > test.txt << 'EOF'
hello world
EOF

[openai] >> exit
```

The agent will:
1. Parse your natural language request
2. Generate appropriate bash commands via LLM
3. Execute commands with tool calls
4. Return results and continue conversation
5. Support multi-turn interactions with full history

## Project Structure

```
src/
├── agent.ts                    # Main model-agnostic agent loop
├── models/                     # LLM provider implementations
│   ├── types.ts               # Unified type definitions
│   ├── anthropic.ts           # Anthropic provider
│   ├── openai.ts              # OpenAI provider
│   └── index.ts               # Provider factory
├── tools/                      # Tool implementations
│   ├── bash.ts                # Shell command execution tool
│   └── index.ts               # Tool exports
```

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Configuration

Start with the provided [.env.example](.env.example) file as a template:
```bash
cp .env.example .env
```

Edit `.env` with your API credentials and preferred settings.

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MODEL_PROVIDER` | Provider to use (`openai`, `anthropic`) | `openai` | No |
| `OPENAI_API_KEY` | OpenAI API key or compatible service | - | Yes (for OpenAI) |
| `OPENAI_BASE_URL` | OpenAI base URL or compatible endpoint | `https://api.openai.com/v1` | No |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4` | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | Yes (for Anthropic) |
| `ANTHROPIC_BASE_URL` | Anthropic base URL | `https://api.anthropic.com` | No |
| `ANTHROPIC_MODEL` | Anthropic model name | `claude-3-sonnet-20240229` | No |

#### Common Provider Configurations

**OpenAI (Default):**
```env
MODEL_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4
```

**NVIDIA API (OpenAI-compatible):**
```env
MODEL_PROVIDER=openai
OPENAI_API_KEY=nvapi-...
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
OPENAI_MODEL=qwen/qwen3-coder-480b-a35b-instruct
```

**Local Ollama:**
```env
MODEL_PROVIDER=anthropic
ANTHROPIC_BASE_URL=http://localhost:11434
ANTHROPIC_MODEL=qwen3.5:9b
```

**Anthropic Claude:**
```env
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-opus-20240229
```

## Development

**Build TypeScript:**
```bash
npm run build
```

**Watch mode (auto-rebuild on file changes):**
```bash
npm run dev
```

## Available Tools

### Bash
Execute shell commands with full support for:
- **Pipelines**: `ls | grep .ts`
- **Command chaining**: `cd src && ls -la`
- **File I/O**: `echo "content" > file.txt`
- **Heredoc**: `cat << 'EOF' ... EOF`
- **Redirects**: `command > output.txt`, `command >> append.txt`

## Extending the Codebase

### Adding a New LLM Provider

1. Create `src/models/yourprovider.ts` implementing the `ModelProvider` interface
2. Register in `src/models/index.ts`
3. Add environment variables to `.env`

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed examples.

### Adding New Tools

1. Create `src/tools/yourtool.ts`
2. Export from `src/tools/index.ts`
3. Add tool definition to `TOOLS` array in `src/agent.ts`

## Supported Providers

- **OpenAI**: GPT-4, GPT-3.5-Turbo, and compatible APIs (NVIDIA, Azure, etc.)
- **Anthropic**: Claude models via direct API or local Ollama
- **Local**: Ollama with Llama 2, Qwen, and other compatible models

## Requirements

- Node.js 18 or higher
- TypeScript 5.5+
- Valid API credentials for your chosen provider
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
