import type { ToolRunner } from './toolRunner';

/**
 * Tool call in OpenAI-compatible format.
 */
export type ToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
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
 * Expects OpenAI-compatible format: {"name": "...", "arguments": {...}}
 * Returns null if parsing fails or the result is invalid.
 */
const parseToolJson = (rawJson: string): ExtractedToolCall | null => {
  try {
    const parsed = JSON.parse(rawJson) as ToolCall;
    if (!parsed?.name || typeof parsed.name !== 'string') return null;
    const args = parsed.arguments && typeof parsed.arguments === 'object' 
      ? (parsed.arguments as Record<string, unknown>) 
      : {};

    return {
      toolCall: {
        name: parsed.name,
        arguments: args
      },
      rawBlock: rawJson
    };
  } catch {
    return null;
  }
};

/**
 * Extracts a tool call from model output.
 * 
 * Expected format (OpenAI-style):
 * <tool_call>
 * {"name": "read", "arguments": {"path": "file.md"}}
 * </tool_call>
 *
 * When multiple tool blocks exist, uses the LAST one.
 */
export const extractFencedToolCall = (text: string): ExtractionResult | null => {
  const allBlocks: { rawBlock: string; json: string }[] = [];

  // Find XML tool blocks: <tool_call>{JSON}</tool_call>
  const xmlMatches = text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi);
  for (const match of xmlMatches) {
    const content = match[1].trim();
    // Extract JSON object from content (may have newlines/whitespace)
    const jsonMatch = content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      allBlocks.push({ rawBlock: match[0], json: jsonMatch[1].trim() });
    }
  }

  // Handle unclosed XML: <tool_call>{...} (some models don't close properly)
  const unclosedMatches = text.matchAll(/<tool_call>\s*(\{[\s\S]*?\})(?=\s*$|\s*<|\n\n)/gi);
  for (const match of unclosedMatches) {
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
};

export const formatToolActivity = (call: ToolCall): string => {
  const n = call.name;
  const args = call.arguments ?? {};
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
  // Strip XML tool blocks: <tool_call>...</tool_call>
  let result = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  
  // Strip unclosed XML tool blocks: <tool_call>{...}
  result = result.replace(/<tool_call>\s*\{[\s\S]*?\}(?=\s*$|\s*<|\n\n)/gi, '');
  
  // Strip any stray <tool_call> tags
  result = result.replace(/<\/?tool_call>/gi, '');
  
  const normalized = result.replace(/\n{3,}/g, '\n\n');
  return normalized.trim();
};

/**
 * Executes a parsed tool call via ToolRunner.
 * Returns the tool result.
 */
export const executeToolCall = async (runner: ToolRunner, call: ToolCall): Promise<ToolExecutionResult> => {
  const result = await runner.executeTool(call.name, call.arguments ?? {});
  return {
    name: call.name,
    result
  };
};
