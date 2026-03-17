import readline from "readline/promises";
import { spawn } from "child_process";
import { stdin as input, stdout as output } from "process";
import { Anthropic } from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
dotenv.config();
const client = new Anthropic({
    apiKey: process.env["ANTHROPIC_API_KEY"],
    baseURL: process.env["ANTHROPIC_BASE_URL"],
});
const MODEL = process.env["ANTHROPIC_MODEL"] ?? "qwen3.5:9b";
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
async function runBash(command) {
    const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
    if (dangerous.some((d) => command.includes(d))) {
        return "Error: Dangerous command blocked";
    }
    // VERY important: parse command safely (no shell)
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    return new Promise((resolve) => {
        try {
            const child = spawn(cmd, args, {
                cwd: process.cwd(),
                shell: false, // 🔒 critical
            });
            let output = "";
            const timeout = setTimeout(() => {
                child.kill("SIGKILL");
                resolve("Error: Timeout (120s)");
            }, 120000);
            child.stdout.on("data", (data) => {
                output += data.toString();
            });
            child.stderr.on("data", (data) => {
                output += data.toString();
            });
            child.on("close", () => {
                clearTimeout(timeout);
                output = output.trim();
                resolve(output ? output.slice(0, 50000) : "(no output)");
            });
            child.on("error", (err) => {
                clearTimeout(timeout);
                resolve(`Error: ${err.message}`);
            });
        }
        catch (err) {
            resolve(`Error: ${err.message}`);
        }
    });
}
async function agentProcess(messages) {
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
            if (response.stop_reason !== "tool_use") {
                break;
            }
            const results = [];
            for (const block of response.content) {
                if (block.type === "tool_use") {
                    const command = block.input.command;
                    console.log(`\x1b[33m$ ${command}\x1b[0m`);
                    const output = await runBash(command);
                    console.log(output.slice(0, 200));
                    results.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: output,
                    });
                }
            }
            messages.push({
                role: "user",
                content: results,
            });
        }
        catch (err) {
            console.error("Anthropic API call failed:", err);
            break;
        }
    }
}
async function main() {
    const rl = readline.createInterface({ input, output });
    const history = [];
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
        }
        catch (err) {
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
//# sourceMappingURL=s01_agent_loop.js.map