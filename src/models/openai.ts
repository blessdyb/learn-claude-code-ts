import OpenAI from "openai";
import type {
  ModelProvider,
  Message,
  Tool,
  ModelResponse,
  ToolCall,
} from "./types.js";

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.model = process.env["OPENAI_MODEL"] ?? "gpt-4";
    this.client = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
      baseURL: process.env["OPENAI_BASE_URL"],
    });
  }

  async initialize(): Promise<void> {
    console.log({
      provider: "OpenAI",
      model: this.model,
      baseURL: process.env["OPENAI_BASE_URL"],
    });
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    tools: Tool[],
  ): Promise<ModelResponse> {
    // Convert unified message format to OpenAI format
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message
    openaiMessages.push({ role: "system", content: systemPrompt });

    // Add conversation messages
    for (const m of messages) {
      if (m.role === "system") continue;

      if (typeof m.content === "string") {
        openaiMessages.push({
          role: m.role,
          content: m.content,
        });
      } else {
        // Tool results
        for (const toolCall of m.content) {
          openaiMessages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify(toolCall.arguments),
          } as OpenAI.Chat.ChatCompletionMessageParam);
        }
      }
    }

    // Convert unified tool format to OpenAI format
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: "auto",
      max_tokens: 8000,
    });

    // Parse response
    const toolCalls: ToolCall[] = [];
    let content = "";

    const choice = response.choices[0];
    if (choice.message.content) {
      content = choice.message.content;
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === "function") {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments),
          });
        }
      }
    }

    return {
      content,
      toolCalls,
      stopReason:
        choice.finish_reason === "tool_calls"
          ? "tool_use"
          : choice.finish_reason === "stop"
            ? "end_turn"
            : "max_tokens",
    };
  }
}
