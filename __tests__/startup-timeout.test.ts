import { withStartupTimeout } from '../lib/startup-timeout';

describe('startup timeout', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps a startup response that arrives before the deadline', async () => {
    await expect(withStartupTimeout(Promise.resolve('loaded'), 'fallback', 2_000)).resolves.toBe('loaded');
  });

  it('uses the safe fallback when a startup request never resolves', async () => {
    jest.useFakeTimers();
    const result = withStartupTimeout(new Promise<string>(() => {}), 'fallback', 2_000);

    await jest.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toBe('fallback');
  });
});
