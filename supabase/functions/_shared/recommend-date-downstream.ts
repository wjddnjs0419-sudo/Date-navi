export const RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS = 20_000;

export class RecommendDateDownstreamTimeoutError extends Error {
  constructor() {
    super('recommend-date downstream timed out');
    this.name = 'RecommendDateDownstreamTimeoutError';
  }
}

export class RecommendDateDownstreamMalformedError extends Error {
  constructor() {
    super('recommend-date downstream returned malformed JSON');
    this.name = 'RecommendDateDownstreamMalformedError';
  }
}

type DownstreamResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type DownstreamFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<DownstreamResponse>;

type GenerateAiSelectionInput = {
  supabaseUrl: string;
  anonKey: string;
  authorization: string;
  prompt: string;
  promptVersion: string;
  action?: string;
};

type GenerateAiSelectionOptions = {
  fetchImpl?: DownstreamFetch;
  timeoutMs?: number;
};

export async function invokeGenerateAiSelection(
  input: GenerateAiSelectionInput,
  options: GenerateAiSelectionOptions = {},
): Promise<unknown> {
  const fetchImpl: DownstreamFetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, options.timeoutMs ?? RECOMMEND_DATE_DOWNSTREAM_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${input.supabaseUrl}/functions/v1/generate-ai`, {
      method: 'POST',
      headers: {
        Authorization: input.authorization,
        apikey: input.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: input.action ?? 'recommend_date_select',
        prompt: input.prompt,
        prompt_version: input.promptVersion,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`generate-ai returned ${response.status}`);
    try {
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new RecommendDateDownstreamMalformedError();
    }
  } catch (error) {
    if (didTimeout && error instanceof Error && error.name === 'AbortError') {
      throw new RecommendDateDownstreamTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
