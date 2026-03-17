import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Anthropic } from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
  baseURL: process.env["ANTHROPIC_BASE_URL"],
  model: process.env["ANTHROPIC_MODEL"],
});

const SYSTEM = `You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.`;
const TOOLS = [
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

async function AgentLoop(messages) {
  while (true) {
    const response = await client.chat.completions.create({
      system: SYSTEM,
      tools: TOOLS,
      messages,
      max_tokens: 2048,
    });
  }
}

const __filename__ = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename__) {
  const rl = readline.createInterface({ input, output });
  const history = [];
  while (true) {
    try {
      const query = await rl.question("\x1b[36ms01 >> \x1b[0m");

      if (!query || ["q", "exit"].includes(query.trim().toLowerCase())) {
        break;
      }

      history.push({ role: "user", content: query });
    } catch (err) {
      // Handles Ctrl+C / EOF
      break;
    }
  }
  rl.close();
}
