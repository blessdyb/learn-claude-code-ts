import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Anthropic } from "@anthropic-ai/sdk";
import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import { runBash } from "./mini_shell.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
  baseURL: process.env["ANTHROPIC_BASE_URL"],
});

const MODEL = process.env["ANTHROPIC_MODEL"] ?? "qwen3.5:9b";

const SYSTEM = `You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.`;

const TOOLS: ToolUnion[] = [
  {
    name: "bash",
    description: "Run a shell command.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];

type Message = {
  role: "user" | "assistant";
  content: any;
};

type ToolUseBlock = {
  type: "tool_use";
  id: string;
  input: {
    command: string;
  };
};

type Response = {
  content: any[];
  stop_reason: string;
};

async function agentProcess(messages: Message[]) {
  while (true) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        messages,
        system: SYSTEM,
        tools: TOOLS,
        max_tokens: 8000,
        stream: false,
      });
      if (!response || !response.content) {
        throw new Error("Anthropic response missing content");
      }
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "tool_use") {
        break;
      }
      const results: any[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const command = (block as any).input.command;

          console.log(`\x1b[33m$ ${command}\x1b[0m`);

          const output = await runBash(command);

          console.log(output.slice(0, 200));

          results.push({
            type: "tool_result",
            tool_use_id: (block as any).id,
            content: output,
          });
        }
      }

      messages.push({
        role: "user",
        content: results,
      });
    } catch (err) {
      console.error("Anthropic API call failed:", err);
      break;
    }
  }
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const history: Message[] = [];

  while (true) {
    try {
      const query = await rl.question("\x1b[36ms01 >> \x1b[0m");

      if (!query || ["q", "exit"].includes(query.trim().toLowerCase())) {
        break;
      }

      history.push({ role: "user", content: query });
      await agentProcess(history);

      const responseContent = history[history.length - 1].content;
      if (Array.isArray(responseContent)) {
        for (const block of responseContent) {
          if (block.text) {
            console.log(block.text);
          }
        }
      }
    } catch (err) {
      console.error("Unhandled agent error:", err);
      break;
    }
  }

  rl.close();
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
