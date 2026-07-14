import {
  invokeGenerateAiSelection,
  RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS,
  RecommendDateDownstreamMalformedError,
  RecommendDateDownstreamTimeoutError,
  type DownstreamFetch,
} from '../supabase/functions/_shared/recommend-date-downstream';

const input = {
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'anon-key',
  authorization: 'Bearer user-token',
  prompt: 'server-only prompt',
  promptVersion: 'recommend-date-v1',
};

afterEach(() => {
  jest.useRealTimers();
});

describe('recommend-date downstream timeout boundary', () => {
  it('uses a bounded 20-second timeout', () => {
    expect(RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS).toBe(20_000);
  });

  it('aborts a stalled fetch and throws the dedicated timeout error', async () => {
    jest.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl: DownstreamFetch = jest.fn(async (_url, init) => {
      capturedSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('request aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const result = invokeGenerateAiSelection(input, { fetchImpl });
    const rejection = expect(result).rejects.toBeInstanceOf(RecommendDateDownstreamTimeoutError);
    await jest.advanceTimersByTimeAsync(RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS);

    await rejection;
    expect(capturedSignal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timeout after a successful response', async () => {
    jest.useFakeTimers();
    const fetchImpl: DownstreamFetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ steps: [{ stepId: 'meal', candidateId: 'candidate-1' }] }),
    }));

    await expect(invokeGenerateAiSelection(input, { fetchImpl })).resolves.toEqual({
      steps: [{ stepId: 'meal', candidateId: 'candidate-1' }],
    });
    expect(JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      action: 'recommend_date_select',
      prompt_version: input.promptVersion,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not mislabel an AbortError that occurs before its own timeout fires', async () => {
    jest.useFakeTimers();
    const fetchImpl: DownstreamFetch = jest.fn(async () => {
      const error = new Error('external cancellation');
      error.name = 'AbortError';
      throw error;
    });

    const result = invokeGenerateAiSelection(input, { fetchImpl });

    await expect(result).rejects.not.toBeInstanceOf(RecommendDateDownstreamTimeoutError);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('classifies a response JSON parse failure as dedicated malformed downstream data', async () => {
    jest.useFakeTimers();
    const fetchImpl: DownstreamFetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('private invalid JSON'); },
    }));

    await expect(invokeGenerateAiSelection(input, { fetchImpl }))
      .rejects.toBeInstanceOf(RecommendDateDownstreamMalformedError);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves an AbortError from a stalled response body as the dedicated timeout', async () => {
    jest.useFakeTimers();
    const fetchImpl: DownstreamFetch = jest.fn(async (_url, init) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('body read aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }));

    const result = invokeGenerateAiSelection(input, { fetchImpl });
    const rejection = expect(result).rejects.toBeInstanceOf(RecommendDateDownstreamTimeoutError);
    await jest.advanceTimersByTimeAsync(RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS);

    await rejection;
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ['non-2xx', jest.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }))],
    ['network', jest.fn(async () => { throw new TypeError('network unavailable'); })],
  ])('does not classify %s failure as malformed', async (_case, fetchImpl) => {
    await expect(invokeGenerateAiSelection(input, { fetchImpl }))
      .rejects.not.toBeInstanceOf(RecommendDateDownstreamMalformedError);
  });
});
