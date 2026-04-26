# Model-Agnostic Agent Architecture

## Overview

The codebase has been refactored to support multiple LLM providers using a model-agnostic abstraction layer. This allows seamless switching between different model providers (OpenAI, Anthropic) without changing the core agent logic.

## Folder Structure

```
src/
├── agent.ts                 # Main model-agnostic agent loop
├── models/                  # Model provider implementations
│   ├── types.ts            # Shared type definitions
│   ├── anthropic.ts        # Anthropic SDK implementation
│   ├── openai.ts           # OpenAI SDK implementation
│   └── index.ts            # Provider factory & exports
├── tools/                   # Tool implementations
│   ├── bash.ts             # Bash command execution tool
│   └── index.ts            # Tool exports
├── s01_agent_loop.ts       # Original Anthropic-only version (legacy)
└── s02_openai_agent_loop.ts # Original OpenAI-only version (legacy)
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

## Configuration

Environment variables in `.env`:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
OPENAI_MODEL=qwen/qwen3-coder-480b-a35b-instruct

# Anthropic Configuration
ANTHROPIC_API_KEY=your_key
ANTHROPIC_BASE_URL=http://localhost:8080
ANTHROPIC_MODEL=qwen

# Provider Selection (default: openai)
MODEL_PROVIDER=openai
```

## Adding a New Provider

1. Create a new file in `src/models/`, e.g., `src/models/claude.ts`
2. Implement the `ModelProvider` interface
3. Register in `src/models/index.ts` getModelProvider function
4. Add environment variables for configuration
5. Update package.json scripts if needed

Example template:

```typescript
import type { ModelProvider, Message, Tool, ModelResponse } from "./types.js";

export class YourProvider implements ModelProvider {
  async initialize(): Promise<void> {
    // Setup
  }

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

## Legacy Scripts

For compatibility, the original single-provider implementations are still available:

```bash
npm run start:s01    # Original Anthropic version
npm run start:s02    # Original OpenAI version
```

## Design Benefits

✅ **Provider Independence**: Agent logic is completely independent of SDK choice  
✅ **Easy Testing**: Mock providers for unit tests  
✅ **Extensible**: Add new providers without changing agent code  
✅ **Type-Safe**: Full TypeScript support with unified types  
✅ **Backward Compatible**: Legacy scripts still work
