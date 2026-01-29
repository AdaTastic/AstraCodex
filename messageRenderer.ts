import type { Message, ParsedHeader } from './types';
import { stripToolBlocks, formatToolActivity } from './toolOrchestrator';
import { extractThink, extractHeaderAndBody, extractFinal, getActivityLine } from './textParser';

export interface MessageRenderElements {
  transcriptEl: HTMLElement;
}

/**
 * Renders all messages to the transcript element.
 */
export const renderMessages = (
  messages: Message[],
  transcriptEl: HTMLElement,
  onToggleHeader: (index: number) => void,
  onToggleThink: (index: number) => void
): void => {
  (transcriptEl as any).empty();
  
  messages.forEach((msg, index) => {
    const row = (transcriptEl as any).createDiv({ cls: ['agentic-chat-row', `role-${msg.role}`] });
    const bubble = row.createDiv({ cls: 'agentic-chat-bubble' });
    const label = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
    bubble.createDiv({ cls: 'agentic-chat-label', text: label });

    if (msg.role === 'assistant' && msg.header) {
      const headerToggle = bubble.createDiv({
        cls: 'agentic-chat-header-toggle',
        text: msg.headerExpanded ? 'Header ▾' : 'Header ▸'
      });
      headerToggle.addEventListener('click', () => onToggleHeader(index));

      if (msg.headerExpanded) {
        bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.header });
      }
    }

    if (msg.role === 'assistant' && msg.think) {
      const thinkToggle = bubble.createDiv({
        cls: 'agentic-chat-header-toggle',
        text: msg.thinkExpanded ? 'Think ▾' : 'Think ▸'
      });
      thinkToggle.addEventListener('click', () => onToggleThink(index));

      if (msg.thinkExpanded) {
        bubble.createDiv({ cls: 'agentic-chat-header-text', text: msg.think });
      }
    }

    const displayText =
      msg.text && msg.text.trim().length > 0
        ? msg.text
        : msg.role === 'assistant' && msg.think
          ? '(No final answer was produced — expand Think)'
          : msg.text;

    if (msg.role === 'assistant' && msg.activityLine) {
      bubble.createDiv({ cls: 'agentic-chat-tool-activity', text: msg.activityLine });
    }

    bubble.createDiv({ cls: 'agentic-chat-text', text: displayText });
  });
  
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
};

/**
 * Updates the last assistant message with new streaming text.
 * Parses think blocks, headers, and tool activity.
 */
export const updateLastAssistantMessage = (
  messages: Message[],
  text: string,
  parsedHeader: ParsedHeader | null
): string | null => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;

  // Persist raw model output for debugging
  last.rawText = text;

  // Get activity line from tool blocks
  const activityLine = getActivityLine(text, formatToolActivity);
  last.activityLine = activityLine;

  // Remove tool blocks from visible text
  const withoutToolBlocks = stripToolBlocks(text);
  
  // Extract think block
  const { think, rest } = extractThink(withoutToolBlocks);
  if (think) {
    last.think = think;
    if (typeof last.thinkExpanded !== 'boolean') last.thinkExpanded = false;
  }

  // Extract header and body
  const { header, body } = extractHeaderAndBody(rest);
  const { final } = extractFinal(body);
  
  if (header) {
    last.header = header;
    last.text = final ?? body;
  } else if (parsedHeader) {
    last.header = `STATE: ${parsedHeader.state}\nNEEDS_CONFIRMATION: ${parsedHeader.needsConfirmation}`;
    const { final: finalFromRest } = extractFinal(rest);
    last.text = finalFromRest ?? rest;
  } else {
    const { final: finalFromRest } = extractFinal(rest);
    last.text = finalFromRest ?? rest;
  }

  return activityLine;
};

/**
 * Creates a new message and adds it to the messages array.
 */
export const pushMessage = (
  messages: Message[],
  role: Message['role'],
  text: string,
  header?: string
): void => {
  messages.push({ role, text, header, headerExpanded: false });
};
