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
 * Parses JSON from a raw tool block string.
 * Returns null if parsing fails or the result is invalid.
 */
const parseToolJson = (rawJson: string): ExtractedToolCall | null => {
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
      rawBlock: rawJson
    };
  } catch {
    return null;
  }
};

/**
 * Extracts a tool block from model output.
 * Supports two formats:
 *
 * 1. Fenced markdown (preferred):
 * ```tool
 * {"name":"read","args":{...}}
 * ```
 *
 * 2. XML-style (GLM models):
 * <tool_call>{"name":"read","args":{...}}</tool_call>
 * or
 * <tool_call>tool
 * {"name":"read","args":{...}}
 * </tool_call>
 *
 * When multiple tool blocks exist, uses the LAST one.
 */
export const extractFencedToolCall = (text: string): ExtractionResult | null => {
  // Collect all tool blocks from both formats
  const allBlocks: { rawBlock: string; json: string }[] = [];

  // 1. Find fenced tool blocks: ```tool {...}```
  const fencedMatches = text.matchAll(/```tool\s*([\s\S]*?)```/g);
  for (const match of fencedMatches) {
    allBlocks.push({ rawBlock: match[0], json: match[1].trim() });
  }

  // 2. Find XML tool blocks: <tool_call>...</tool_call>
  // Handle both <tool_call>{json}</tool_call> and <tool_call>tool\n{json}</tool_call>
  const xmlMatches = text.matchAll(/<tool_call>(?:tool\s*)?([\s\S]*?)<\/tool_call>/gi);
  for (const match of xmlMatches) {
    allBlocks.push({ rawBlock: match[0], json: match[1].trim() });
  }

  // 3. Handle unclosed XML: <tool_call>{json} or <tool_call>tool\n{json}
  // Some models don't close the tag properly
  const unclosedMatches = text.matchAll(/<tool_call>(?:tool\s*)?(\{[\s\S]*?\})(?=\s|$|<)/gi);
  for (const match of unclosedMatches) {
    // Only add if not already captured by closed XML
    const json = match[1].trim();
    if (!allBlocks.some(b => b.json === json)) {
      allBlocks.push({ rawBlock: match[0], json });
    }
  }

  if (allBlocks.length === 0) {
    return null;
  }

  // Use the LAST tool block (models often output planning blocks early, 
  // then the real one after)
  const lastBlock = allBlocks[allBlocks.length - 1];
  const result = parseToolJson(lastBlock.json);
  
  if (result) {
    result.rawBlock = lastBlock.rawBlock;
    return result;
  }

  return null;
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
  // Strip fenced tool blocks: ```tool {...}```
  let result = text.replace(/```tool\s*[\s\S]*?```/g, '');
  
  // Strip XML tool blocks: <tool_call>...</tool_call>
  result = result.replace(/<tool_call>(?:tool\s*)?[\s\S]*?<\/tool_call>/gi, '');
  
  // Strip unclosed XML tool blocks: <tool_call>{...}
  result = result.replace(/<tool_call>(?:tool\s*)?\{[\s\S]*?\}(?=\s|$|<)/gi, '');
  
  const normalized = result.replace(/\n{3,}/g, '\n\n');
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
