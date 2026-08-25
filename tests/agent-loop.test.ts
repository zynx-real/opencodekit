import { describe, expect, it, vi } from 'vitest';
import { isStepCount, tool, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = (
  content: LanguageModelV4GenerateResult['content'],
  reason: 'stop' | 'tool-calls' = 'stop',
): LanguageModelV4GenerateResult => ({
  content,
  finishReason: { unified: reason, raw: reason },
  usage,
  warnings: [],
});

describe('AI SDK agent loop', () => {
  it('executes a multi-tool sequence and returns a final answer', async () => {
    const execute = vi.fn(async ({ value }: { value: number }) => ({
      doubled: value * 2,
    }));
    const model = new MockLanguageModelV4({
      doGenerate: [
        finish(
          [
            {
              type: 'tool-call',
              toolCallId: '1',
              toolName: 'double',
              input: '{"value":2}',
            },
          ],
          'tool-calls',
        ),
        finish(
          [
            {
              type: 'tool-call',
              toolCallId: '2',
              toolName: 'double',
              input: '{"value":4}',
            },
          ],
          'tool-calls',
        ),
        finish([{ type: 'text', text: 'done' }]),
      ],
    });
    const agent = new ToolLoopAgent({
      model,
      tools: { double: tool({ inputSchema: z.object({ value: z.number() }), execute }) },
      stopWhen: isStepCount(10),
    });
    const result = await agent.generate({ prompt: 'double twice' });
    expect(result.text).toBe('done');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('surfaces tool failures to the model for recovery', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        finish(
          [{ type: 'tool-call', toolCallId: '1', toolName: 'fail', input: '{}' }],
          'tool-calls',
        ),
        finish([{ type: 'text', text: 'recovered' }]),
      ],
    });
    const agent = new ToolLoopAgent({
      model,
      tools: {
        fail: tool({
          inputSchema: z.object({}),
          execute: async (): Promise<string> => {
            throw new Error('expected failure');
          },
        }),
      },
      stopWhen: isStepCount(5),
    });
    expect((await agent.generate({ prompt: 'recover' })).text).toBe('recovered');
  });

  it('honors maximum turns', async () => {
    const repeated = Array.from({ length: 10 }, (_, index) =>
      finish(
        [{ type: 'tool-call', toolCallId: String(index), toolName: 'noop', input: '{}' }],
        'tool-calls',
      ),
    );
    const model = new MockLanguageModelV4({ doGenerate: repeated });
    const agent = new ToolLoopAgent({
      model,
      tools: { noop: tool({ inputSchema: z.object({}), execute: async () => 'ok' }) },
      stopWhen: isStepCount(3),
    });
    const result = await agent.generate({ prompt: 'loop' });
    expect(result.steps).toHaveLength(3);
  });

  it('supports cancellation', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) =>
        await new Promise((_, reject) =>
          abortSignal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        ),
    });
    const agent = new ToolLoopAgent({ model });
    const controller = new AbortController();
    const pending = agent.generate({ prompt: 'wait', abortSignal: controller.signal });
    setImmediate(() => controller.abort());
    await expect(pending).rejects.toThrow(/abort/i);
  });
});
