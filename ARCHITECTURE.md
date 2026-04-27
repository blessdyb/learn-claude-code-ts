# Model-Agnostic Agent Architecture

## Overview

A model-agnostic TypeScript-based coding agent that works with multiple LLM providers (OpenAI, Anthropic) through a unified abstraction layer. The agent receives natural language prompts, executes bash commands using function calling, and provides results interactively.

## Folder Structure

```
src/
├── agent.ts                   # Main model-agnostic agent loop & CLI
├── models/                    # LLM provider implementations
│   ├── types.ts              # Unified type definitions (ModelProvider interface)
│   ├── index.ts              # Provider factory function
│   ├── openai.ts             # OpenAI SDK implementation
│   └── anthropic.ts          # Anthropic SDK implementation
├── tools/                     # Tool implementations
│   ├── index.ts              # Tool exports
│   └── bash.ts               # Shell command execution with pipe/redirection support
└── utils/
    └── logger.ts             # Enhanced logging system (file/console, log levels)
```

## Key Components

### Model Provider Interface (`models/types.ts`)

All model providers implement a unified `ModelProvider` interface:

```typescript
interface ModelProvider {
  initialize(): Promise<void>;
  chat(
    messages: Message[],
    systemPrompt: string,
    tools: Tool[]
  ): Promise<ModelResponse>;
}
```

### Implementations

- **AnthropicProvider** (`models/anthropic.ts`): Uses `@anthropic-ai/sdk`
- **OpenAIProvider** (`models/openai.ts`): Uses `openai` SDK

Both providers translate between unified types and their respective SDK formats.

### Tools

- **Bash Tool** (`tools/bash.ts`): Executes shell commands with support for:
  - Pipelines (`|`)
  - Command chaining (`&&`)
  - File redirects (`>`, `>>`)
  - Heredoc syntax (`<<`)

### Logging System (`utils/logger.ts`)

Enhanced logging with configurable levels and file output:

```typescript
enum LogLevel { DEBUG, INFO, WARN, ERROR }

class Logger {
  logApiRequest(provider: string, endpoint: string, payload: any): void;
  logApiResponse(provider: string, response: any, duration: number): void;
  logToolExecution(provider?: string, toolName: string, data?: any): void;
  logAgentInteraction(step: string, data: any, provider?: string): void;
  error(component: string, error: any): void;
}
```

## Data Flow

```
user input → append to history → model.chat()
  ↓
if tool_use: execute bash command → capture output
  ↓
append result to history → loop continues
  ↓
else (text response): display and break loop
```

## Usage

### Default (OpenAI)

```bash
npm run start
```

### With Anthropic

```bash
npm run start:anthropic
```

### With Explicit Provider Selection

```bash
MODEL_PROVIDER=openai npm run start
MODEL_PROVIDER=anthropic npm run start
```

### Development Mode

```bash
npm run dev       # Watch TypeScript compilation
npm run build     # Build once
```

## Configuration

Environment variables in `.env`:

```env
# ============================================================================
# Logging Configuration
# ============================================================================
LOG_LEVEL=DEBUG          # DEBUG, INFO, WARN, ERROR
LOG_FILE=false           # Enable file logging
LOG_DIR=./logs           # Log directory
PROVIDER_LOGGING=true    # Separate files per provider

# ============================================================================
# Model Provider Selection (default: openai)
# ============================================================================
MODEL_PROVIDER=openai

# ============================================================================
# OpenAI Configuration
# ============================================================================
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# ============================================================================
# Anthropic Configuration
# ============================================================================
ANTHROPIC_API_KEY=your_key
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-3-sonnet-20240229
```

### Logging Output

- **Console**: Color-coded output with ANSI escape codes
- **File**: JSON Lines format (one JSON object per line)
- **Files**: `./logs/agent.log` or `./logs/agent_{provider}.log`

## Adding a New Provider

1. Create `src/models/yourprovider.ts` implementing `ModelProvider` interface
2. Register in `src/models/index.ts` `getModelProvider` function
3. Add environment variables for configuration

Example template:

```typescript
import type { ModelProvider, Message, Tool, ModelResponse } from "./types.js";

export class YourProvider implements ModelProvider {
  async initialize(): Promise<void> { }

  async chat(
    messages: Message[],
    systemPrompt: string,
    tools: Tool[]
  ): Promise<ModelResponse> {
    // Translate messages to your SDK format
    // Call your model
    // Translate response back to unified format
    return {
      content: "...",
      toolCalls: [],
      stopReason: "end_turn",
    };
  }
}
```

## Design Benefits

✅ **Provider Independence**: Agent logic is completely independent of SDK choice
✅ **Easy Testing**: Mock providers for unit tests
✅ **Extensible**: Add new providers without changing agent code
✅ **Type-Safe**: Full TypeScript support with unified types
✅ **Debuggable**: Comprehensive logging with configurable levels and file output
