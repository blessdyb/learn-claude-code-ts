import type { Message, ContentBlock, ToolResultBlock, ToolCallBlock } from '../models/types.js';

/**
 * Message normalization layer
 *
 * Three jobs:
 * 1. Strip internal metadata fields the API doesn't understand
 * 2. Ensure every tool_use has a matching tool_result (insert placeholder if missing)
 * 3. Merge consecutive same-role messages (API requires strict alternation)
 */
export function normalizeMessages(messages: Message[]): Message[] {
  // Step 1: Strip internal metadata fields
  const cleaned: Message[] = messages.map(msg => {
    const clean: Message = { role: msg.role, content: msg.content };

    if (typeof msg.content === 'string') {
      clean.content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Strip blocks that are objects with fields starting with underscore
      clean.content = msg.content.filter(
        block => {
          if (typeof block !== 'object' || block === null) return true;
          return !Object.keys(block).some(k => k.startsWith('_'));
        }
      ) as ContentBlock[];
    }

    return clean;
  });

  // Step 2: Collect existing tool_result IDs
  const existingResultIds = new Set<string>();

  for (const msg of cleaned) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (isToolResultBlock(block) && block.tool_use_id) {
        existingResultIds.add(block.tool_use_id);
      }
    }
  }

  // Find orphaned tool_use blocks and insert placeholder results
  const orphanedToolUseIds = new Set<string>();

  for (const msg of cleaned) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (isToolCallBlock(block) && !existingResultIds.has(block.id)) {
        orphanedToolUseIds.add(block.id);
      }
    }
  }

  // Insert placeholder results for orphaned tool uses
  for (const id of orphanedToolUseIds) {
    cleaned.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: '(cancelled)',
        } as ToolResultBlock,
      ],
    });
  }

  // Step 3: Merge consecutive same-role messages
  if (cleaned.length === 0) {
    return cleaned;
  }

  const merged: Message[] = [cleaned[0]];

  for (let i = 1; i < cleaned.length; i++) {
    const current = cleaned[i];
    const previous = merged[merged.length - 1];

    if (current.role === previous.role) {
      if (typeof previous.content === 'string' && typeof current.content === 'string') {
        // Both are text strings - concatenate
        previous.content = previous.content + current.content;
      } else if (Array.isArray(previous.content) && Array.isArray(current.content)) {
        // Both are arrays - concat
        previous.content = [...previous.content, ...current.content];
      } else if (typeof previous.content === 'string' && Array.isArray(current.content)) {
        // Convert string to array and concat
        previous.content = [{ type: 'text', text: previous.content }, ...current.content];
      } else if (Array.isArray(previous.content) && typeof current.content === 'string') {
        // Convert string to array and concat
        previous.content = [...previous.content, { type: 'text', text: current.content }];
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return typeof block === 'object' && block !== null && block.type === 'tool_result';
}

function isToolCallBlock(block: ContentBlock): block is ToolCallBlock {
  return typeof block === 'object' && block !== null && block.type === 'tool_use';
}
