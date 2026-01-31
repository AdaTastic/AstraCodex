import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { vi } from 'vitest';
import { join } from 'path';
import { DEFAULT_SETTINGS, type AstraCodexSettings } from '../../settings';
import { ModelClient, type ModelResponse } from '../../modelClient';
import type { AgentLoopModel } from '../../agentLoop';
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
 * Wrap a model client with output length limiting for faster tests.
 * Aborts streaming early if output exceeds maxChars.
 */
export const createLimitedModel = (
  model: ModelClient,
  maxChars: number = 4000
): AgentLoopModel => {
  return {
    generateStream: async (prompt, onDelta, opts) => {
      const controller = new AbortController();
      const originalSignal = opts?.signal;
      
      // Abort if original signal aborts
      if (originalSignal) {
        originalSignal.addEventListener('abort', () => controller.abort());
      }
      
      let totalChars = 0;
      let fullText = '';
      
      const wrappedOnDelta = (delta: string) => {
        totalChars += delta.length;
        fullText += delta;
        onDelta(delta);
        
        // Abort if we exceed max chars
        if (totalChars > maxChars) {
          controller.abort();
        }
      };
      
      try {
        const response = await model.generateStream(prompt, wrappedOnDelta, {
          signal: controller.signal
        });
        return response;
      } catch (err) {
        // If aborted due to length limit, return what we have
        if (controller.signal.aborted && totalChars > maxChars) {
          return {
            text: fullText,
            header: { state: 'idle', needsConfirmation: false }
          } as ModelResponse;
        }
        throw err;
      }
    }
  };
};

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
        case 'line_edit': {
          const path = args.path as string;
          const startLine = args.startLine as number;
          const endLine = args.endLine as number;
          const replacement = (args.replacement ?? args.newContent ?? '') as string;
          
          const content = vault.files[path];
          if (content === undefined) {
            return { error: `File not found: ${path}` };
          }
          
          const lines = content.split(/\r?\n/);
          const startIdx = Math.max(1, startLine) - 1;
          const endIdx = Math.min(lines.length, endLine) - 1;
          const before = lines.slice(startIdx, endIdx + 1).join('\n');
          
          const updatedLines = [
            ...lines.slice(0, startIdx),
            ...replacement.split(/\r?\n/),
            ...lines.slice(endIdx + 1)
          ];
          const updatedContent = updatedLines.join('\n');
          
          // Update the file in the mock vault
          vault.files[path] = updatedContent;
          
          return {
            path,
            preview: { startLine, endLine, before, after: replacement },
            success: true
          };
        }
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

const DEBUG_LOG_DIR = 'tests/e2e/logs';
let currentTestName = 'unknown';

export const setCurrentTestName = (name: string) => {
  currentTestName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
};

const getLogFilePath = () => {
  if (!existsSync(DEBUG_LOG_DIR)) {
    mkdirSync(DEBUG_LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(DEBUG_LOG_DIR, `${currentTestName}_${timestamp}.txt`);
};

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
    },
    onAssistantDelta: (delta: string, fullText: string) => {
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].modelResponse = fullText;
      }
    },
    onToolResult: ({ name, result }: { name: string; result: unknown }) => {
      if (log.turns[currentTurn]) {
        log.turns[currentTurn].toolResults.push({ name, result });
      }
    }
  };
};

export const writeDebugLog = (log: DebugLog, vaultCalls: Record<string, unknown[]>, testName?: string) => {
  if (testName) {
    setCurrentTestName(testName);
  }
  
  // Print to console (no file writing)
  console.log('\n========== E2E TEST DEBUG LOG ==========');
  console.log(`Test: ${currentTestName}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');
  
  for (const turn of log.turns) {
    console.log(`--- Turn ${turn.turn} ---`);
    console.log('');
    console.log('MODEL RESPONSE:');
    console.log(turn.modelResponse);
    console.log('');
    
    if (turn.toolResults.length > 0) {
      console.log('TOOL RESULTS:');
      for (const tr of turn.toolResults) {
        console.log(`  [${tr.name}]: ${typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result, null, 2)}`);
      }
      console.log('');
    }
  }
  
  console.log('========== VAULT CALLS ==========');
  console.log(JSON.stringify(vaultCalls, null, 2));
  console.log('');
  console.log('================================\n');
  
  return null; // No file path returned
};

export const printDebugLog = (log: DebugLog) => {
  // Full output to console (no truncation)
  console.log('\n========== DEBUG LOG ==========');
  for (const turn of log.turns) {
    console.log(`\n--- Turn ${turn.turn} ---`);
    console.log('MODEL RESPONSE:');
    console.log(turn.modelResponse);
    if (turn.toolResults.length > 0) {
      console.log('TOOL RESULTS:');
      for (const tr of turn.toolResults) {
        const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result, null, 2);
        console.log(`  [${tr.name}]: ${resultStr}`);
      }
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
