import { readFileSync } from 'fs';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS, type AstraCodexSettings } from '../../settings';
import { ModelClient } from '../../modelClient';
import { buildPrompt } from '../../promptBuilder';
import { buildConversationHistory } from '../../conversationHistory';
import type { Message } from '../../types';
import type { ToolRunner } from '../../toolRunner';

/**
 * Load settings from data.json (plugin settings file).
 * Falls back to DEFAULT_SETTINGS if file doesn't exist.
 */
export const loadTestSettings = (): AstraCodexSettings => {
  try {
    const data = JSON.parse(readFileSync('data.json', 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/**
 * Create a mock vault for testing file operations.
 * Tracks all calls for assertions.
 */
export const createMockVault = (files: Record<string, string> = {}) => {
  const calls = {
    read: [] as Array<{ path: string }>,
    list: [] as Array<{ prefix: string }>,
    write: [] as Array<{ path: string; content: string }>,
    append: [] as Array<{ path: string; content: string }>
  };

  return {
    calls,
    files,

    read: vi.fn(async (path: string) => {
      calls.read.push({ path });
      const content = files[path];
      if (content === undefined) {
        // Return error message instead of throwing - allows model to handle gracefully
        return `ERROR: File not found: ${path}`;
      }
      return content;
    }),

    list: vi.fn(async (prefix: string) => {
      calls.list.push({ prefix });
      return Object.keys(files).filter(f => f.startsWith(prefix || ''));
    }),

    write: vi.fn(async (path: string, content: string) => {
      calls.write.push({ path, content });
      files[path] = content;
    }),

    append: vi.fn(async (path: string, content: string) => {
      calls.append.push({ path, content });
      files[path] = (files[path] ?? '') + content;
    })
  };
};

export type MockVault = ReturnType<typeof createMockVault>;

/**
 * Create a mock ToolRunner that uses the mock vault.
 */
export const createMockToolRunner = (vault: MockVault): ToolRunner => {
  return {
    executeTool: async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'read':
          return vault.read(args.path as string);
        case 'list':
          return vault.list(args.prefix as string ?? '');
        case 'write':
          await vault.write(args.path as string, args.content as string);
          return { success: true };
        case 'append':
          await vault.append(args.path as string, args.content as string);
          return { success: true };
        case 'active_file':
          return { path: 'test-active-file.md', content: '# Active File' };
        case 'line_edit':
          return { success: true };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    }
  } as unknown as ToolRunner;
};

/**
 * Build a prompt using the standard prompt builder.
 */
export const buildTestPrompt = (history: Message[], settings: AstraCodexSettings): string => {
  const lastUserMessage = [...history].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) {
    throw new Error('No user message in history');
  }

  return buildPrompt({
    userMessage: lastUserMessage.content ?? '',
    settings,
    coreRules: {
      charter: 'You are Astra, a helpful AI assistant.',
      states: 'STATE: idle - Ready to assist',
      voice: 'Friendly and concise'
    },
    history: buildConversationHistory(history, settings.maxContextChars, { excludeLatestUserMessage: true }),
    tools: [
      { name: 'read', description: 'Read a file', params: { path: 'string' } },
      { name: 'list', description: 'List files', params: { prefix: 'string' } },
      { name: 'write', description: 'Write a file', params: { path: 'string', content: 'string' } },
      { name: 'append', description: 'Append to a file', params: { path: 'string', content: 'string' } }
    ]
  });
};

/**
 * Debug logger for E2E tests.
 * Captures all model outputs and tool calls for debugging.
 */
export interface DebugLog {
  turns: Array<{
    turn: number;
    modelResponse: string;
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
    toolResults: Array<{ name: string; result: unknown }>;
  }>;
}

export const createDebugCallbacks = (log: DebugLog) => {
  let currentTurn = -1;
  
  return {
    onTurnStart: ({ turn }: { turn: number }) => {
      currentTurn = turn;
      log.turns[turn] = {
        turn,
        modelResponse: '',
        toolCalls: [],
        toolResults: []
      };
      console.log(`\n--- Turn ${turn} ---`);
    },
    onAssistantDelta: (delta: string, fullText: string) => {
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].modelResponse = fullText;
      }
    },
    onToolResult: ({ name, result }: { name: string; result: unknown }) => {
      console.log(`[Tool: ${name}] Result:`, typeof result === 'string' ? result.slice(0, 200) : result);
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].toolResults.push({ name, result });
      }
    }
  };
};

export const printDebugLog = (log: DebugLog) => {
  console.log('\n========== DEBUG LOG ==========');
  for (const turn of log.turns) {
    console.log(`\n--- Turn ${turn.turn} ---`);
    console.log('Model Response:', turn.modelResponse.slice(0, 500));
    if (turn.modelResponse.length > 500) {
      console.log('... (truncated)');
    }
    if (turn.toolResults.length > 0) {
      console.log('Tool Results:', turn.toolResults);
    }
  }
  console.log('\n================================');
};

/**
 * Create the full test context for E2E tests.
 */
export const createTestContext = (files: Record<string, string> = {}) => {
  const settings = loadTestSettings();
  const model = new ModelClient(settings);
  const vault = createMockVault(files);
  const toolRunner = createMockToolRunner(vault);
  const debugLog: DebugLog = { turns: [] };
  const debugCallbacks = createDebugCallbacks(debugLog);

  return {
    settings,
    model,
    vault,
    toolRunner,
    debugLog,
    debugCallbacks,
    printDebug: () => printDebugLog(debugLog),
    buildPrompt: (history: Message[]) => buildTestPrompt(history, settings)
  };
};
