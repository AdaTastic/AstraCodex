import { extractFencedToolCall, isExtractionError } from './toolOrchestrator';

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

  // Remove those header lines from the body (first occurrence only).
  let body = text;
  for (const h of headerLines) {
    const idx = body.indexOf(h);
    if (idx !== -1) {
      body = (body.slice(0, idx) + body.slice(idx + h.length)).trim();
    }
  }
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
