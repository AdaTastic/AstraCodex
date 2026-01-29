import type { Message } from './types';
import { stripToolBlocks } from './toolOrchestrator';

const stripThinkBlocks = (text: string): string => {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
};

const stripLeakedHeaders = (text: string): string => {
  return text
    .replace(/^STATE:\s*\S+\s*/gim, '')
    .replace(/^NEEDS_CONFIRMATION:\s*\S+\s*/gim, '')
    .replace(/^FINAL:\s*/gim, '')
    .replace(/^TOOL CALLS:\s*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * OpenAI-compatible message format for history.
 */
interface HistoryEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
}

/**
 * Builds conversation history in OpenAI-compatible JSON format.
 * 
 * Output format:
 * [
 *   {"role": "user", "content": "..."},
 *   {"role": "assistant", "content": "...", "tool_calls": [...]},
 *   {"role": "tool", "content": "...", "tool_call_id": "..."}
 * ]
 */
export const buildConversationHistory = (
  messages: Message[],
  maxChars: number,
  opts?: {
    excludeLatestUserMessage?: boolean;
  }
): string => {
  if (maxChars <= 0) return '[]';

  const excludeLatestUserMessage = opts?.excludeLatestUserMessage ?? false;
  const entries: HistoryEntry[] = [];

  let startIndex = messages.length - 1;
  if (excludeLatestUserMessage && messages[startIndex]?.role === 'user') {
    startIndex -= 1;
  }

  // Build newest -> oldest so we can trim oldest first by stopping when we hit maxChars.
  const tempEntries: HistoryEntry[] = [];
  let used = 0;

  for (let i = startIndex; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;

    let entry: HistoryEntry;

    if (msg.role === 'user') {
      const content = msg.text?.trim() || '';
      if (!content) continue;
      entry = { role: 'user', content };
    } else if (msg.role === 'assistant') {
      const base = stripToolBlocks(msg.text ?? '').trim();
      const content = stripLeakedHeaders(stripThinkBlocks(base));
      
      entry = { role: 'assistant', content: content || '[action]' };
      
      // Add tool_calls if present
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        entry.tool_calls = msg.toolCalls.map(tc => ({
          name: tc.name,
          arguments: tc.arguments
        }));
      }
    } else if (msg.role === 'tool') {
      // Make tool results very explicit so model recognizes what was already done
      const rawContent = msg.text?.trim() || JSON.stringify(msg.toolResult ?? '');
      const toolName = msg.toolCallId?.split('-').pop() ?? 'tool';
      const content = `[TOOL RESULT: ${toolName}]\n${rawContent}`;
      entry = { 
        role: 'tool', 
        content,
        tool_call_id: msg.toolCallId 
      };
    } else {
      continue;
    }

    const entryJson = JSON.stringify(entry);
    const addition = entryJson.length + 2; // comma + spacing

    if (used + addition > maxChars) {
      break;
    }

    tempEntries.push(entry);
    used += addition;
  }

  // Reverse to oldest -> newest for readability.
  return JSON.stringify(tempEntries.reverse(), null, 2);
};

/**
 * Legacy format builder - returns plain text for backward compatibility.
 * Use buildConversationHistory for new OpenAI-style format.
 */
export const buildConversationHistoryText = (
  messages: Message[],
  maxChars: number,
  opts?: {
    excludeLatestUserMessage?: boolean;
  }
): string => {
  if (maxChars <= 0) return '';

  const excludeLatestUserMessage = opts?.excludeLatestUserMessage ?? false;
  const lines: string[] = [];
  let used = 0;

  let startIndex = messages.length - 1;
  if (excludeLatestUserMessage && messages[startIndex]?.role === 'user') {
    startIndex -= 1;
  }

  for (let i = startIndex; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'tool') continue;

    let prefix: string;
    let text: string;

    if (msg.role === 'user') {
      prefix = 'User: ';
      text = msg.text?.trim() || '';
    } else if (msg.role === 'assistant') {
      prefix = 'Assistant: ';
      const base = stripToolBlocks(msg.text ?? '').trim();
      text = stripLeakedHeaders(stripThinkBlocks(base));
      if (!text && msg.activityLine) {
        text = `[${msg.activityLine}]`;
      }
    } else {
      prefix = 'Tool Result: ';
      text = msg.text?.trim() || JSON.stringify(msg.toolResult ?? '');
    }

    if (!text) continue;

    const chunk = `${prefix}${text}`;
    const separator = lines.length === 0 ? '' : '\n';
    const addition = `${chunk}${separator}`;

    if (used + addition.length > maxChars) {
      break;
    }

    lines.push(chunk);
    used += addition.length;
  }

  return lines.reverse().join('\n');
};
