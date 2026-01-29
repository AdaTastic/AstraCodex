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

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    callbacks?.onTurnStart?.({ turn, history });
    const prompt = buildPrompt(history);
    
    // Create assistant message slot BEFORE streaming so callbacks can update it
    const assistantMessage: Message = {
      role: 'assistant',
      text: '',
      rawText: ''
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
        assistantMessage.text = streamed;
        assistantMessage.rawText = streamed;
        callbacks?.onAssistantDelta?.(delta, streamed);
      },
      { signal }
    );

    lastResponse = response;
    callbacks?.onHeader?.(response.header);

    // Finalize assistant message with complete response
    assistantMessage.text = response.text;
    assistantMessage.rawText = response.text;
    assistantMessage.header = response.header ? `STATE: ${response.header.state}` : undefined;

    // Extract tool call from response
    const extracted = extractFencedToolCall(response.text);
    
    // If tool call found, add it to message
    if (extracted && !isExtractionError(extracted)) {
      const toolCallInfo: ToolCallInfo = {
        name: extracted.toolCall.name,
        arguments: extracted.toolCall.arguments ?? {}
      };
      assistantMessage.toolCalls = [toolCallInfo];
    }

    // No tool call - done
    if (!extracted) break;

    // Handle extraction errors (e.g., multiple tool blocks)
    if (isExtractionError(extracted)) {
      callbacks?.onToolError?.({ error: extracted.error });
      // Add error as user message and continue
      const errorMessage: Message = {
        role: 'user',
        text: `ERROR: ${extracted.error}\n\nPlease try again with exactly ONE tool block.`
      };
      history.push(errorMessage);
      callbacks?.onMessageAdded?.(errorMessage);
      continue;
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Execute tool
    const executed = await executeToolCall(toolRunner, extracted.toolCall);
    callbacks?.onToolResult?.({ name: executed.name, result: executed.result });

    // Add tool result to history as role:"tool" message
    const toolResultMessage: Message = {
      role: 'tool',
      text: typeof executed.result === 'string' 
        ? executed.result 
        : JSON.stringify(executed.result, null, 2),
      toolResult: executed.result,
      toolCallId: `${turn}-${executed.name}`
    };
    history.push(toolResultMessage);
    callbacks?.onMessageAdded?.(toolResultMessage);

    // Loop continues - model will see tool result and decide next action
  }

  if (!lastResponse) {
    throw new Error('Agent loop did not produce a model response');
  }
  return lastResponse;
};
