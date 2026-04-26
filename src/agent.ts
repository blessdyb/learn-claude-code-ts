import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import dotenv from "dotenv";
import {
  getModelProvider,
  type ModelProvider,
  type Message,
  type Tool,
} from "./models/index.js";
import { runBash } from "./tools/index.js";

dotenv.config();

const SYSTEM = `You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.`;

const TOOLS: Tool[] = [
  {
    name: "bash",
    description: "Run a shell command.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
    },
  },
];

/**
 * Main agent loop - model agnostic
 */
async function agentProcess(
  model: ModelProvider,
  messages: Message[],
): Promise<void> {
  while (true) {
    try {
      const response = await model.chat(messages, SYSTEM, TOOLS);

      // Add assistant response to history
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // If no tool calls, we're done
      if (response.toolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      const toolResults: { id: string; output: string }[] = [];

      for (const toolCall of response.toolCalls) {
        if (toolCall.name === "bash") {
          const command = toolCall.arguments.command;
          console.log(`\x1b[33m$ ${command}\x1b[0m`);

          try {
            const output = await runBash(command);
            console.log(output.slice(0, 200));
            toolResults.push({ id: toolCall.id, output });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.log(`\x1b[31m${errorMsg}\x1b[0m`);
            toolResults.push({ id: toolCall.id, output: errorMsg });
          }
        }
      }

      // Add tool results as user message with tool calls (for next iteration)
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: response.toolCalls.map((tc, i) => ({
            id: tc.id,
            name: tc.name,
            arguments: {
              ...tc.arguments,
              result: toolResults[i]?.output,
            },
          })),
        });
      }
    } catch (err) {
      console.error("Agent error:", err);
      break;
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const providerName = process.env["MODEL_PROVIDER"] || "openai";
  const model = getModelProvider(providerName);
  await model.initialize();

  const rl = readline.createInterface({ input, output });
  const history: Message[] = [];

  while (true) {
    try {
      const query = await rl.question(`\x1b[36m[${providerName}] >> \x1b[0m`);

      if (!query || ["q", "exit"].includes(query.trim().toLowerCase())) {
        break;
      }

      history.push({ role: "user", content: query });
      await agentProcess(model, history);

      const lastMessage = history[history.length - 1];
      if (lastMessage.role === "assistant") {
        if (typeof lastMessage.content === "string" && lastMessage.content) {
          console.log(lastMessage.content);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("readline was closed")) {
          break;
        }
        console.error("Error:", err.message);
      }
      break;
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
