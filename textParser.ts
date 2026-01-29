import { extractFencedToolCall, isExtractionError, formatToolActivity, type ToolCall } from './toolOrchestrator';
import type { DerivedState, MessageSegment } from './types';

/**
 * Extracts the first <think>...</think> block from model output.
 */
export const extractThink = (text: string): { think: string | null; rest: string } => {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { think: null, rest: text };
  const think = match[1].trim();
  const rest = (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim();
  return { think: think || null, rest };
};

/**
 * Extracts STATE: and NEEDS_CONFIRMATION: header lines from model output.
 * Searches the first 60 lines for header keys.
 */
export const extractHeaderAndBody = (text: string): { header: string | null; body: string } => {
  const lines = text.split(/\r?\n/);
  let stateLine: string | null = null;
  let needsLine: string | null = null;

  const scanLimit = Math.min(lines.length, 60);
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i].trim();
    if (!stateLine && line.startsWith('STATE:')) stateLine = line;
    if (!needsLine && line.startsWith('NEEDS_CONFIRMATION:')) needsLine = line;
    if (stateLine && needsLine) break;
  }

  const headerLines = [stateLine, needsLine].filter(Boolean) as string[];
  const header = headerLines.length ? headerLines.join('\n') : null;

  // Remove header lines from the body using regex (handles whitespace variations)
  let body = text;
  body = body.replace(/^STATE:\s*[a-zA-Z_]+\s*\n?/gim, '');
  body = body.replace(/^NEEDS_CONFIRMATION:\s*(true|false)\s*\n?/gim, '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();
  
  return { header, body };
};

/**
 * Extracts the FINAL: section from model output.
 * Everything after "FINAL:" is the user-facing answer.
 */
export const extractFinal = (text: string): { final: string | null; body: string } => {
  const match = text.match(/(^|\n)\s*FINAL:\s*/);
  if (!match || match.index === undefined) return { final: null, body: text };
  const start = match.index + match[0].length;
  const final = text.slice(start).trim();
  const body = text.slice(0, match.index).trim();
  return { final: final || null, body };
};

/**
 * Extracts retrigger message from STATE: RETRIGGER header.
 */
export const extractRetriggerMessage = (text: string): string | null => {
  const { header } = extractHeaderAndBody(text);
  if (!header) return null;
  const retriggerMatch = header.match(/STATE:\s*RETRIGGER\s*(\n)?(.*)/);
  if (retriggerMatch) {
    return retriggerMatch[2]?.trim() ?? null;
  }
  return null;
};

/**
 * Extracts the path argument from the last fenced tool block.
 */
export const extractLastReadPath = (text: string): string | null => {
  const match = text.match(/```tool\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const path = parsed?.args?.path;
    return typeof path === 'string' ? path : null;
  } catch {
    return null;
  }
};

/**
 * Parses state header values from header text.
 */
export const parseStateFromHeader = (header: string): { state: string | null; needsConfirmation: boolean | null } => {
  const stateMatch = header.match(/STATE:\s*([a-zA-Z_]+)/);
  const needsConfirmMatch = header.match(/NEEDS_CONFIRMATION:\s*(true|false)/);
  
  return {
    state: stateMatch ? stateMatch[1] : null,
    needsConfirmation: needsConfirmMatch ? needsConfirmMatch[1] === 'true' : null
  };
};

/**
 * Gets the activity line from a tool call in text.
 * Returns null if no valid tool call or if extraction error.
 */
export const getActivityLine = (text: string, formatFn: (call: { name: string; args?: Record<string, unknown> }) => string): string | null => {
  const extracted = extractFencedToolCall(text);
  if (!extracted || isExtractionError(extracted)) return null;
  return formatFn(extracted.toolCall);
};

/**
 * Derives UI state from actual events (not model output).
 * Used for face animation and status indicators.
 */
export const deriveState = (context: {
  isStreaming: boolean;
  toolCall?: ToolCall | null;
  requiresConfirmation: boolean;
  hasError: boolean;
}): DerivedState => {
  if (context.hasError) return 'error';
  if (context.requiresConfirmation) return 'awaiting_confirmation';

  if (context.toolCall) {
    const toolName = context.toolCall.name;
    if (toolName === 'read') return 'reading';
    if (toolName === 'list') return 'searching';
    if (toolName === 'write') return 'writing';
    if (toolName === 'append') return 'appending';
    if (toolName === 'line_edit') return 'editing';
    if (toolName === 'active_file') return 'checking';
    return 'thinking'; // unknown tool
  }

  if (context.isStreaming) return 'thinking';
  return 'idle';
};

/**
 * Parses raw model output into segments for agentic display.
 * Splits text at tool block boundaries.
 * Supports both fenced (```tool) and XML (<tool_call>) formats.
 * 
 * Example input:
 *   "I'll search for that. ```tool {...}``` Found it! <tool_call>{...}</tool_call> Here's what I see."
 * 
 * Returns:
 *   [
 *     { type: 'text', content: "I'll search for that." },
 *     { type: 'tool', activity: 'searching: ...', toolName: 'list' },
 *     { type: 'text', content: "Found it!" },
 *     { type: 'tool', activity: 'reading: ...', toolName: 'read' },
 *     { type: 'text', content: "Here's what I see." }
 *   ]
 */
export const parseMessageSegments = (rawText: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  
  // Combined regex for both fenced and XML formats
  // Group 1: fenced JSON, Group 2: XML JSON
  const toolBlockRegex = /```tool\s*([\s\S]*?)```|<tool_call>(?:tool\s*)?([\s\S]*?)<\/tool_call>/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = toolBlockRegex.exec(rawText)) !== null) {
    // Text before this tool block
    const textBefore = rawText.slice(lastIndex, match.index).trim();
    if (textBefore) {
      // Clean up the text - remove leaked headers
      const cleanedText = cleanSegmentText(textBefore);
      if (cleanedText) {
        segments.push({ type: 'text', content: cleanedText });
      }
    }

    // Parse the tool block (check both capture groups)
    const toolJson = (match[1] ?? match[2])?.trim();
    if (toolJson) {
      try {
        const parsed = JSON.parse(toolJson) as ToolCall;
        if (parsed?.name) {
          const activity = formatToolActivity(parsed);
          segments.push({
            type: 'tool',
            activity,
            toolName: parsed.name
          });
        }
      } catch {
        // Invalid JSON - skip this tool block
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Text after the last tool block
  const textAfter = rawText.slice(lastIndex).trim();
  if (textAfter) {
    const cleanedText = cleanSegmentText(textAfter);
    if (cleanedText) {
      segments.push({ type: 'text', content: cleanedText });
    }
  }

  return segments;
};

/**
 * Cleans up text for display in a segment.
 * Removes leaked headers, think blocks, tool blocks, and normalizes whitespace.
 */
const cleanSegmentText = (text: string): string => {
  let cleaned = text;

  // Remove think blocks (including malformed ones without opening tag)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>/i, ''); // Malformed: only closing tag

  // Remove any stray tool_call tags that weren't matched
  cleaned = cleaned.replace(/<tool_call>(?:tool\s*)?[\s\S]*?<\/tool_call>/gi, '');
  cleaned = cleaned.replace(/<tool_call>(?:tool\s*)?\{[\s\S]*?\}(?=\s|$|<)/gi, '');
  cleaned = cleaned.replace(/<\/?tool_call>/gi, ''); // Stray opening/closing tags

  // Remove leaked header lines (STATE:, NEEDS_CONFIRMATION:, FINAL:)
  cleaned = cleaned.replace(/^STATE:\s*\S+\s*/gim, '');
  cleaned = cleaned.replace(/^NEEDS_CONFIRMATION:\s*\S+\s*/gim, '');
  cleaned = cleaned.replace(/^FINAL:\s*/gim, '');
  cleaned = cleaned.replace(/^TOOL CALLS:\s*/gim, '');

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
};
