import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { getModelProvider, type ModelProvider, type Message, type Tool } from './models/index.js';
import { runBash, fileReader, fileWriter, fileEditor } from './tools/index.js';
import { ToolDispatcher, type ToolName } from './tools/dispatch.js';
import { normalizeMessages } from './utils/message-normalizer.js';

dotenv.config();

const SYSTEM = `You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.`;

const TOOLS: Tool[] = [
  {
    name: 'bash',
    description: 'Run a shell command.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read file contents.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace exact text in file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
];

/**
 * Main agent loop - model agnostic
 */
async function agentProcess(
  model: ModelProvider,
  messages: Message[],
  providerName: string
): Promise<void> {
  const dispatcher = new ToolDispatcher({
    bash: args => runBash(args.command as string),
    read_file: args => fileReader.read({ path: args.path as string, limit: args.limit as number }),
    write_file: args =>
      fileWriter.write({ path: args.path as string, content: args.content as string }),
    edit_file: args =>
      fileEditor.edit({
        path: args.path as string,
        old_text: args.old_text as string,
        new_text: args.new_text as string,
      }),
  });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Normalize messages before sending to model
      const normalizedMessages = normalizeMessages(messages);

      const response = await model.chat(normalizedMessages, SYSTEM, TOOLS);

      logger.logAgentInteraction(
        'model-response',
        {
          content: response.content.slice(0, 200),
          toolCalls: response.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
          })),
          stopReason: response.stopReason,
        },
        providerName
      );

      // Add assistant response to history
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // If no tool calls, we're done
      if (response.toolCalls.length === 0) {
        break;
      }

      // Execute tool calls with dispatch layer
      const toolResults = await dispatcher.executeTools(
        response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name as ToolName,
          args: tc.arguments,
        }))
      );

      // Log results
      for (const result of toolResults) {
        const toolCall = response.toolCalls.find(tc => tc.id === result.id);
        if (toolCall) {
          const args = toolCall.arguments;
          if (toolCall.name === 'bash') {
            console.log(`\x1b[33m$ ${args.command}\x1b[0m`);
            console.log(result.output.slice(0, 200));
            logger.logToolExecution(providerName, toolCall.name, args);
          } else {
            logger.logToolExecution(providerName, toolCall.name, args);
          }
          console.log(result.output.slice(0, 200));
        }
      }

      // Add tool results as user message with tool calls (for next iteration)
      if (toolResults.length > 0) {
        messages.push({
          role: 'user',
          content: response.toolCalls.map((tc, i) => ({
            id: tc.id,
            name: tc.name,
            arguments: {
              ...tc.arguments,
              result: toolResults[i]?.output,
            },
            type: 'tool_use' as const,
          })),
        });
      }
    } catch (err) {
      logger.error('agent-process', err);
      console.error('Agent error:', err);
      break;
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const providerName = process.env['MODEL_PROVIDER'] || 'openai';
  const model = getModelProvider(providerName);

  logger.logAgentInteraction('initialization', {
    provider: providerName,
    debugEnabled: logger.isLevelEnabled('DEBUG'),
  });

  await model.initialize();

  const rl = readline.createInterface({ input, output });
  const history: Message[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const query = await rl.question(`\x1b[36m[${providerName}] >> \x1b[0m`);

      if (!query || ['q', 'exit'].includes(query.trim().toLowerCase())) {
        break;
      }

      logger.logAgentInteraction('user-input', { query }, providerName);

      history.push({ role: 'user', content: query });
      await agentProcess(model, history, providerName);

      const lastMessage = history[history.length - 1];
      if (lastMessage.role === 'assistant') {
        if (typeof lastMessage.content === 'string' && lastMessage.content) {
          console.log(lastMessage.content);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('readline was closed')) {
          break;
        }
        logger.error('main-loop', err);
        console.error('Error:', err.message);
      }
      break;
    }
  }

  rl.close();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
