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
      const content = msg.content?.trim() || '';
      if (!content) continue;
      entry = { role: 'user', content };
    } else if (msg.role === 'assistant') {
      const base = stripToolBlocks(msg.content ?? '').trim();
      const content = stripLeakedHeaders(stripThinkBlocks(base));
      
      entry = { role: 'assistant', content: content || '[action]' };
      
      // Add tool_calls if present
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls.map(tc => ({
          name: tc.name,
          arguments: tc.arguments
        }));
      }
    } else if (msg.role === 'tool') {
      // Format tool result clearly for model context
      const rawContent = msg.content?.trim() || JSON.stringify(msg.tool_result ?? '');
      const toolName = msg.tool_call_id?.split('-').pop() ?? 'tool';
      const content = `[TOOL RESULT: ${toolName}]\n${rawContent}`;
      entry = { 
        role: 'tool', 
        content,
        tool_call_id: msg.tool_call_id 
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
