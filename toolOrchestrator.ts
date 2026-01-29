import type { ToolRunner } from './toolRunner';

export type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  retrigger?: {
    message: string;
  };
};

export type ExtractedToolCall = {
  toolCall: ToolCall;
  rawBlock: string;
};

export type ExtractionError = {
  error: string;
  blockCount: number;
};

export type ExtractionResult = ExtractedToolCall | ExtractionError;

export const isExtractionError = (result: ExtractionResult | null): result is ExtractionError => {
  return result !== null && 'error' in result;
};

/**
 * Extracts a single fenced tool block from model output.
 * Returns an error if multiple tool blocks are detected.
 *
 * Only triggers on:
 *
 * ```tool
 * {"name":"read","args":{...},"retrigger":{"message":"..."}}
 * ```
 */
export const extractFencedToolCall = (text: string): ExtractionResult | null => {
  // Count all tool blocks to detect duplicates
  const allMatches = text.match(/```tool\s*[\s\S]*?```/g);
  
  if (!allMatches || allMatches.length === 0) {
    return null;
  }
  
  if (allMatches.length > 1) {
    return {
      error: `Multiple tool blocks detected (${allMatches.length}). You must output exactly ONE tool block per response. Do not repeat tool calls.`,
      blockCount: allMatches.length
    };
  }

  const match = text.match(/```tool\s*([\s\S]*?)```/);
  if (!match) return null;

  const rawJson = match[1].trim();
  try {
    const parsed = JSON.parse(rawJson) as ToolCall;
    if (!parsed?.name || typeof parsed.name !== 'string') return null;
    const args = parsed.args && typeof parsed.args === 'object' ? (parsed.args as Record<string, unknown>) : {};
    const retrigger =
      parsed.retrigger && typeof parsed.retrigger === 'object' && typeof (parsed.retrigger as any).message === 'string'
        ? { message: (parsed.retrigger as any).message }
        : undefined;

    return {
      toolCall: {
        name: parsed.name,
        args,
        retrigger
      },
      rawBlock: match[0]
    };
  } catch {
    return null;
  }
};

export type ToolExecutionResult = {
  name: string;
  result: unknown;
  retriggerMessage?: string;
};

export const formatToolActivity = (call: ToolCall): string => {
  const n = call.name;
  const args = call.args ?? {};
  if (n === 'active_file') return 'reading: [current file]';
  if (n === 'list') {
    const prefix = typeof (args as any).prefix === 'string' ? (args as any).prefix : '';
    return `listing: ${prefix || '[all files]'}`;
  }
  if (n === 'read') {
    const path = typeof (args as any).path === 'string' ? (args as any).path : '[file]';
    return `reading: ${path}`;
  }
  if (n === 'write' || n === 'append' || n === 'line_edit') {
    return `editing: ${typeof (args as any).path === 'string' ? (args as any).path : '[file]'}`;
  }
  return `tool: ${n}`;
};

export const stripToolBlocks = (text: string): string => {
  const withoutBlocks = text.replace(/```tool\s*[\s\S]*?```/g, '');
  const normalized = withoutBlocks.replace(/\n{3,}/g, '\n\n');
  return normalized.trim();
};

/**
 * Executes a parsed tool call via ToolRunner.
 * Returns the tool result and optional retrigger message.
 */
export const executeToolCall = async (runner: ToolRunner, call: ToolCall): Promise<ToolExecutionResult> => {
  const result = await runner.executeTool(call.name, call.args ?? {});
  return {
    name: call.name,
    result,
    retriggerMessage: call.retrigger?.message
  };
};
