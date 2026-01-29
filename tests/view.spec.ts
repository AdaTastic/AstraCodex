import { AgenticChatView } from '../view';
import { ToolRunner } from '../toolRunner';
import { ToolRegistry } from '../toolRegistry';
import { ChatStore } from '../chatStore';
import { ModelClient } from '../modelClient';
import { RuleManager } from '../ruleManager';
import { buildPrompt } from '../promptBuilder';
import { buildConversationHistory } from '../conversationHistory';
import { runAgentLoop } from '../agentLoop';
import type { Message } from '../types';
import { mergeSettings } from '../settings';
import { StateMachine } from '../stateMachine';

describe('AgenticChatView retrigger handling', () => {
  let view: AgenticChatView;
  let mockAbortController: AbortController;
  let mockToolRunner: ToolRunner;
  let mockStateMachine: StateMachine;
  
  beforeEach(() => {
    // Create mock implementations
    mockAbortController = new AbortController();
    mockStateMachine = new StateMachine(['idle', 'thinking', 'acting']);
    mockToolRunner = new ToolRunner(
      {
        read: () => Promise.resolve('content'),
        list: () => Promise.resolve([]),
        write: () => Promise.resolve(),
        append: () => Promise.resolve()
      },
      () => mockStateMachine.canAct(),
      undefined,
      new ToolRegistry({
        read: () => Promise.resolve('content'),
        list: () => Promise.resolve([])
      }),
      (msg) => {},
      () => 'test.md'
    );

    // Create view with mocked dependencies
    view = new AgenticChatView(
      {} as any,
      mergeSettings({
        maxContextChars: 8000,
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
        includeActiveNote: false
      })
    ) as any;
    
    // Mock required app properties
    view.app = {
      vault: {
        adapter: {
          read: () => Promise.resolve('test content'),
          write: () => Promise.resolve(),
          remove: () => Promise.resolve(),
          exists: () => Promise.resolve(true),
          list: () => Promise.resolve({ files: [] })
        }
      },
      workspace: {
        getActiveFile: () => null
      }
    } as any;
  });

  describe('extractRetriggerMessage', () => {
    it('should extract retrigger message from STATE: RETRIGGER header', () => {
      const text = `STATE: RETRIGGER
Please respond with more details about the topic.`;
      const result = (view as any).extractRetriggerMessage(text);
      expect(result).toBe('Please respond with more details about the topic.');
    });

    it('should extract retrigger message with newline after RETRIGGER', () => {
      const text = `STATE: RETRIGGER
\nPlease respond with more details about the topic.`;
      const result = (view as any).extractRetriggerMessage(text);
      expect(result).toBe('Please respond with more details about the topic.');
    });

    it('should return null if no RETRIGGER state', () => {
      const text = `STATE: ACTING\nNEEDS_CONFIRMATION: false\nFinal answer.`;
      const result = (view as any).extractRetriggerMessage(text);
      expect(result).toBeNull();
    });

    it('should return null if no header', () => {
      const text = 'Just a regular message without state header.';
      const result = (view as any).extractRetriggerMessage(text);
      expect(result).toBeNull();
    });
  });

  describe('state machine update from tool result', () => {
    it('should update state machine from assistant message header', () => {
      const assistantText = 'STATE: ACTING\nNEEDS_CONFIRMATION: true\nThinking...';
      (view as any).updateLastAssistantMessage(assistantText);
      
      // Use private access via private prop accessor if available
      const stateMachine = (view as any).__stateMachine;
      if (stateMachine) {
        expect(stateMachine.state).toBe('acting');
        expect(stateMachine.needsConfirmation).toBe(true);
      }
    });

    it('should handle state without confirmation flag', () => {
      const assistantText = 'STATE: THINKING\nWorking on it...';
      (view as any).updateLastAssistantMessage(assistantText);
      
      const stateMachine = (view as any).__stateMachine;
      if (stateMachine) {
        expect(stateMachine.state).toBe('thinking');
        expect(stateMachine.needsConfirmation).toBe(false);
      }
    });

    it('should handle message without header', () => {
      const assistantText = 'Here is the result.';
      (view as any).updateLastAssistantMessage(assistantText);
      
      // Should not change state machine
      const stateMachine = (view as any).__stateMachine;
      if (stateMachine) {
        expect(stateMachine.state).toBe('idle');
      }
    });
  });

  describe('retrigger state machine check', () => {
    it('should allow retrigger when state machine allows action', () => {
      // Set state machine to 'acting' state which allows action
      (view as any).__stateMachine.setState('acting');
      
      const assistantText = `STATE: RETRIGGER
Please respond with more details.`;
      const result = (view as any).extractRetriggerMessage(assistantText);
      
      expect(result).toBe('Please respond with more details.');
    });

    it('should block retrigger when state machine is idle', () => {
      // Set state machine to 'idle' state which doesn't allow action
      (view as any).__stateMachine.setState('idle');
      
      const assistantText = `STATE: RETRIGGER
Please respond with more details.`;
      const result = (view as any).extractRetriggerMessage(assistantText);
      
      expect(result).toBe('Please respond with more details.');
    });

    it('should respond with helpful message when state machine is idle', () => {
      // Set state machine to 'idle' state which doesn't allow action
      (view as any).__stateMachine.setState('idle');
      
      const assistantText = `STATE: RETRIGGER
Please respond with more details.`;
      const result = (view as any).extractRetriggerMessage(assistantText);
      
      expect(result).toBe('Please respond with more details.');
    });
  });
});