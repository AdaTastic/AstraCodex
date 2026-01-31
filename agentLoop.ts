import type { Message, ToolCallInfo } from './types';
import type { ModelResponse } from './modelClient';
import type { ToolRunner } from './toolRunner';
import { executeToolCall, extractFencedToolCall, isExtractionError, type ToolCall } from './toolOrchestrator';

export type AgentLoopModel = {
  generateStream: (
    prompt: string,
    onDelta: (text: string) => void,
    opts?: { signal?: AbortSignal }
  ) => Promise<ModelResponse>;
};

export type AgentLoopCallbacks = {
  onTurnStart?: (payload: { turn: number; history: Message[] }) => void;
  onAssistantStart?: () => void;
  onAssistantDelta?: (delta: string, fullTextSoFar: string) => void;
  onHeader?: (header: ModelResponse['header']) => void;
  onToolResult?: (payload: { name: string; result: unknown }) => void;
  /** Called when the model outputs multiple tool blocks (error). */
  onToolError?: (payload: { error: string }) => void;
  /** Called when a message is added to history */
  onMessageAdded?: (message: Message) => void;
};

export type RunAgentLoopArgs = {
  /** Initial conversation history (includes system message context) */
  history: Message[];
  buildPrompt: (history: Message[]) => string;
  model: AgentLoopModel;
  toolRunner: ToolRunner;
  maxTurns?: number;
  callbacks?: AgentLoopCallbacks;
  signal?: AbortSignal;
};

/**
 * Runs agent loop: model -> tool_calls? -> execute -> inject result -> repeat
 * 
 * Loop continues until:
 * - Model returns response without tool_calls
 * - maxTurns reached
 * - Signal aborted
 */
export const runAgentLoop = async ({
  history,
  buildPrompt,
  model,
  toolRunner,
  maxTurns = 8,
  callbacks,
  signal
}: RunAgentLoopArgs): Promise<ModelResponse> => {
  let lastResponse: ModelResponse | null = null;
  
  // Track files already read to prevent re-reading
  const filesReadThisSession = new Set<string>();
  
  // Track last tool call to detect immediate repeats
  let lastToolCall: { name: string; args: string } | null = null;
  
  // Count consecutive stop messages sent (to force exit if model keeps looping)
  let consecutiveStopMessages = 0;
  
  // Scan history for previously read files
  for (const msg of history) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.name === 'read' && tc.arguments?.path) {
          filesReadThisSession.add(String(tc.arguments.path));
        }
      }
    }
  }

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    callbacks?.onTurnStart?.({ turn, history });
    const prompt = buildPrompt(history);
    
    // Create assistant message slot BEFORE streaming so callbacks can update it
    const assistantMessage: Message = {
      role: 'assistant',
      content: ''
    };
    history.push(assistantMessage);
    callbacks?.onMessageAdded?.(assistantMessage);
    callbacks?.onAssistantStart?.();

    let streamed = '';
    const response = await model.generateStream(
      prompt,
      (delta) => {
        streamed += delta;
        // Update the existing message in-place during streaming
        assistantMessage.content = streamed;
        callbacks?.onAssistantDelta?.(delta, streamed);
      },
      { signal }
    );

    lastResponse = response;
    callbacks?.onHeader?.(response.header);

    // Finalize assistant message with complete response
    assistantMessage.content = response.text;

    // Extract tool call from response
    const extracted = extractFencedToolCall(response.text);
    
    // If tool call found, add it to message
    if (extracted && !isExtractionError(extracted)) {
      const toolCallInfo: ToolCallInfo = {
        name: extracted.toolCall.name,
        arguments: extracted.toolCall.arguments ?? {}
      };
      assistantMessage.tool_calls = [toolCallInfo];
    }

    // No tool call - done
    if (!extracted) break;

    // Handle extraction errors (e.g., multiple tool blocks)
    if (isExtractionError(extracted)) {
      callbacks?.onToolError?.({ error: extracted.error });
      // Add error as user message and continue
      const errorMessage: Message = {
        role: 'user',
        content: `ERROR: ${extracted.error}\n\nPlease try again with exactly ONE tool block.`
      };
      history.push(errorMessage);
      callbacks?.onMessageAdded?.(errorMessage);
      continue;
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Check for duplicate file read
    const toolCall = extracted.toolCall;
    if (toolCall.name === 'read' && toolCall.arguments?.path) {
      const filePath = String(toolCall.arguments.path);
      if (filesReadThisSession.has(filePath)) {
        consecutiveStopMessages++;
        
        // If model keeps looping despite STOP messages, break out
        if (consecutiveStopMessages >= 3) {
          break;
        }
        
        // Find the original user question to remind the model
        const originalUserMsg = history.find(m => m.role === 'user')?.content ?? 'the user';
        
        // Don't execute - force model to respond with content it already has
        const forceResponseMessage: Message = {
          role: 'user',
          content: `STOP - You already read "${filePath}" earlier. The file content is in the conversation history above.

DO NOT call read again. The content is: Look in the conversation history for [FILE: ${filePath}] or the tool result.

ANSWER THIS NOW using the file content you already have: "${originalUserMsg}"

Write your response now:`
        };
        history.push(forceResponseMessage);
        callbacks?.onMessageAdded?.(forceResponseMessage);
        continue;
      }
      // Track this read
      filesReadThisSession.add(filePath);
      consecutiveStopMessages = 0; // Reset on successful tool execution
    }
    
    // Check for immediately repeated tool call (model looping)
    const currentToolKey = `${toolCall.name}:${JSON.stringify(toolCall.arguments ?? {})}`;
    if (lastToolCall && lastToolCall.name === toolCall.name && lastToolCall.args === JSON.stringify(toolCall.arguments ?? {})) {
      consecutiveStopMessages++;
      
      // If model keeps looping despite STOP messages, break out
      if (consecutiveStopMessages >= 3) {
        break;
      }
      
      // Find the original user question to remind the model
      const originalUserMsg = history.find(m => m.role === 'user')?.content ?? 'the user';
      
      // Model is repeating the same tool call - force a response
      const forceResponseMessage: Message = {
        role: 'user',
        content: `STOP - You already called "${toolCall.name}" and got a result. The data is in the conversation history above.

DO NOT:
- Call any more tools
- Create files
- Do anything except answer the question

ANSWER THIS NOW: "${originalUserMsg}"

If the tool returned an empty list [], say "no files found" or "the folder is empty".
If the tool returned data, summarize it for the user.

Write your response now:`
      };
      history.push(forceResponseMessage);
      callbacks?.onMessageAdded?.(forceResponseMessage);
      lastToolCall = null; // Reset to allow one more attempt
      continue;
    }
    lastToolCall = { name: toolCall.name, args: JSON.stringify(toolCall.arguments ?? {}) };
    consecutiveStopMessages = 0; // Reset on new tool call

    // Execute tool
    const executed = await executeToolCall(toolRunner, toolCall);
    callbacks?.onToolResult?.({ name: executed.name, result: executed.result });

    // Add tool result to history as role:"tool" message (OpenAI format)
    const resultContent = typeof executed.result === 'string' 
      ? executed.result 
      : JSON.stringify(executed.result, null, 2);
    const toolResultMessage: Message = {
      role: 'tool',
      content: resultContent,
      tool_result: executed.result,
      tool_call_id: `${turn}-${executed.name}`
    };
    history.push(toolResultMessage);
    callbacks?.onMessageAdded?.(toolResultMessage);

    // Add a nudge for read operations to encourage the model to respond with the content
    if (toolCall.name === 'read' && !resultContent.startsWith('ERROR')) {
      const nudgeMessage: Message = {
        role: 'user',
        content: `Tool result received. Now respond to the user using the data above. DO NOT call any more tools - just answer with the information you have.`
      };
      history.push(nudgeMessage);
      callbacks?.onMessageAdded?.(nudgeMessage);
    }

    // Loop continues - model will see tool result and decide next action
  }

  if (!lastResponse) {
    throw new Error('Agent loop did not produce a model response');
  }
  return lastResponse;
};
