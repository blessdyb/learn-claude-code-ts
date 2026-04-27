# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A model-agnostic TypeScript-based coding agent CLI that works with multiple LLM providers (OpenAI, Anthropic) through a unified abstraction layer.

## Common Development Commands

```bash
npm install                    # Install dependencies
npm run build                  # Compile TypeScript to JavaScript in dist/
npm run start                  # Build and run with OpenAI (default)
npm run start:anthropic        # Build and run with Anthropic
npm run start:openai           # Explicitly use OpenAI
npm run dev                    # Watch mode for TypeScript compilation

# Linting & Formatting
npm run lint                   # Run ESLint on src/**/*.ts
npm run lint:fix              # Run ESLint and auto-fix issues
npm run format                # Format all TypeScript files with Prettier
npm run format:check         # Check formatting without modifying files
```

## Code Architecture

### High-Level Structure

```
src/
├── agent.ts           # Main model-agnostic agent loop & CLI interface
├── models/            # LLM provider implementations (provider-agnostic)
│   ├── types.ts      # Unified type definitions (ModelProvider interface)
│   ├── index.ts      # Factory function for provider selection
│   ├── openai.ts     # OpenAI SDK implementation
│   └── anthropic.ts  # Anthropic SDK implementation
├── tools/            # Tool implementations
│   ├── index.ts     # Tool exports
│   └── bash.ts      # Shell command execution with pipe/redirection support
└── utils/
    └── logger.ts     # Debug logger with API request/response tracing
```

### Key Architecture Patterns

**Provider Abstraction Layer**: The `ModelProvider` interface in `src/models/types.ts` defines a unified contract that all LLM providers must implement. Both OpenAI and Anthropic providers translate between unified types and their respective SDK formats, allowing the agent loop to remain completely agnostic of the underlying provider.

**Message Flow**:
1. User input → added to conversation history
2. `agentProcess()` calls `model.chat()` with unified message format
3. Provider converts messages to SDK-specific format and calls the API
4. Response converted back to unified format (content + tool calls)
5. Tool calls executed (bash commands) → results appended to history
6. Loop continues until text response (no tool calls)

### Critical Implementation Details

**Bash Tool** (`src/tools/bash.ts`): Implements shell command execution with security-conscious parsing:
- Supports pipelines (`|`) and command chaining (`&&`) via `splitOutsideQuotes()`
- Handles heredoc (`<<`) and file redirection (`>`, `>>`)
- Uses `spawn()` instead of `shell: true` to prevent command injection
- Properly handles quoted strings when splitting on delimiters

**Agent Loop** (`src/agent.ts`): The core loop in `agentProcess()`:
- Appends assistant responses to history
- Executes tool calls and captures output
- Adds tool results as user messages with `tool_call_id`
- Terminates when response contains no tool calls

**Provider Factory** (`src/models/index.ts`): `getModelProvider()` selects provider based on `MODEL_PROVIDER` env var or parameter.

## Configuration

Environment variables (see `.env.example`):
- `MODEL_PROVIDER`: `openai` (default) or `anthropic`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`

### Logging Configuration

The logging system is controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | DEBUG | DEBUG, INFO, WARN, ERROR |
| `LOG_FILE` | false | Enable file logging |
| `LOG_DIR` | ./logs | Directory for log files |
| `PROVIDER_LOGGING` | true | Separate files per provider |

Example:
```bash
LOG_LEVEL=INFO LOG_FILE=true LOG_DIR=./logs npm run start
```

Log files are in JSON Lines format (one JSON object per line):
- `./logs/agent.log` - Combined log file
- `./logs/agent_openai.log` / `agent_anthropic.log` - Provider-specific (when PROVIDER_LOGGING=true)

## TypeScript Configuration

- Target: ES2022, Module: ESNext (bundler resolution)
- Output: `dist/` with source maps and declaration files
- Strict mode enabled

## Linting & Formatting

**Configuration:**
- ESLint with TypeScript support (`.eslintrc.json`)
- Prettier for code formatting (`.prettierrc`)

**Commands:**
- `npm run lint` - Run ESLint to check for issues
- `npm run lint:fix` - Run ESLint and auto-fix fixable issues
- `npm run format` - Format all TypeScript files with Prettier
- `npm run format:check` - Verify formatting without modifications

**Rules:**
- Type-safe imports enforced
- No-unsafe-* rules disabled for flexibility with dynamic data
- `any` types allowed with warnings (necessary for tool calls, API payloads)

## Testing

**Configuration:**
- **Unit Tests**: Vitest (fast, type-safe unit testing)
- **E2E Tests**: Playwright (cross-browser end-to-end testing)
- **Code Coverage**: V8 coverage with HTML reports

**File Structure:**
```
src/__tests__/
├── setup.ts                 # Vitest setup file
├── mocks/                   # Test mocks and fixtures
│   ├── test-provider.ts     # Mock ModelProvider implementations
│   └── test-provider.test.ts
├── tools/
│   └── bash.test.ts         # Unit tests for bash tool
├── utils/
│   └── logger.test.ts       # Unit tests for logger
├── models/
│   └── types.test.ts        # Unit tests for type definitions
└── e2e/
    └── agent.e2e.test.ts    # End-to-end agent tests
```

**Commands:**
- `npm run test` - Run all unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:e2e` - Run e2e tests with Playwright
- `npm run test:e2e:ui` - Run e2e tests with Playwright UI
- `npm run test:e2e:report` - Show Playwright HTML report
- `npm run test -- --coverage` - Run tests with coverage report

**Mock Providers for Testing:**
- `TestProvider` - Returns predictable responses
- `TestProviderWithTools` - Returns tool calls for integration testing
- `TestProviderWithMultipleTools` - Returns multiple tool calls

Example usage:
```typescript
import { TestProvider } from '../__tests__/mocks/test-provider.js';

const provider = new TestProvider([
  { content: 'test', toolCalls: [{ id: '1', name: 'bash', arguments: { command: 'ls' } }], stopReason: 'tool_use' },
  { content: 'done', toolCalls: [], stopReason: 'end_turn' },
]);
```
