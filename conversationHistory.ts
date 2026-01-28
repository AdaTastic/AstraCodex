import type { Message } from './types';
import { stripToolBlocks } from './toolOrchestrator';

export const buildConversationHistory = (
  messages: Message[],
  maxChars: number,
  opts?: {
    /**
     * If true, will skip the newest message when it is a user message.
     * Useful because the prompt already contains the latest "User Request".
     */
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

  // Build newest -> oldest so we can trim oldest first by stopping when we hit maxChars.
  for (let i = startIndex; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    const prefix = msg.role === 'user' ? 'User: ' : 'Assistant: ';
    const text = stripToolBlocks(msg.text ?? '').trim();
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

  // Reverse to oldest -> newest for readability.
  return lines.reverse().join('\n');
};
