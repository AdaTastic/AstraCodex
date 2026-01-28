import type { ModelResponse } from './modelClient';
import type { ToolRunner } from './toolRunner';
import { executeToolCall, extractFencedToolCall } from './toolOrchestrator';

export type AgentLoopModel = {
  generateStream: (
    prompt: string,
    onDelta: (text: string) => void,
    opts?: { signal?: AbortSignal }
  ) => Promise<ModelResponse>;
};

export type AgentLoopCallbacks = {
  onTurnStart?: (payload: { turn: number; userMessage: string }) => void;
  onAssistantStart?: () => void;
  onAssistantDelta?: (delta: string, fullTextSoFar: string) => void;
  onHeader?: (header: ModelResponse['header']) => void;
  onToolResult?: (payload: { name: string; result: unknown }) => void;
  /** Called after tool execution if a retrigger will occur. */
  onRetrigger?: (payload: { message: string }) => void;
};

export type RunAgentLoopArgs = {
  initialUserMessage: string;
  buildPrompt: (userMessage: string) => string;
  model: AgentLoopModel;
  toolRunner: ToolRunner;
  maxTurns?: number;
  callbacks?: AgentLoopCallbacks;
  signal?: AbortSignal;
};

/**
 * Runs: model -> (optional tool call -> tool execute -> retrigger) repeating until no tool call or no retrigger.
 *
 * NOTE: Tool results are appended into the next userMessage so the model can see them.
 */
export const runAgentLoop = async ({
  initialUserMessage,
  buildPrompt,
  model,
  toolRunner,
  maxTurns = 8,
  callbacks,
  signal
}: RunAgentLoopArgs): Promise<ModelResponse> => {
  let userMessage = initialUserMessage;
  let lastResponse: ModelResponse | null = null;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    callbacks?.onTurnStart?.({ turn, userMessage });
    const prompt = buildPrompt(userMessage);
    callbacks?.onAssistantStart?.();

    let streamed = '';
    const response = await model.generateStream(
      prompt,
      (delta) => {
      streamed += delta;
      callbacks?.onAssistantDelta?.(delta, streamed);
      },
      { signal }
    );

    lastResponse = response;
    callbacks?.onHeader?.(response.header);

    const extracted = extractFencedToolCall(response.text);
    if (!extracted) break;

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const executed = await executeToolCall(toolRunner, extracted.toolCall);
    callbacks?.onToolResult?.({ name: executed.name, result: executed.result });

    if (!executed.retriggerMessage) break;
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    callbacks?.onRetrigger?.({ message: executed.retriggerMessage });

    const toolResultText =
      typeof executed.result === 'string' ? executed.result : JSON.stringify(executed.result, null, 2);

    userMessage = `${executed.retriggerMessage}\n\nTool Result (${executed.name}):\n${toolResultText}`;
  }

  if (!lastResponse) {
    throw new Error('Agent loop did not produce a model response');
  }
  return lastResponse;
};
