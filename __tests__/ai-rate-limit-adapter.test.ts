import {
  acquireCourseGenerationLock,
  consumeCourseGenerationQuota,
} from '../supabase/functions/_shared/ai-rate-limit';

const rpcClient = (rows: Record<string, unknown>[]) => ({
  rpc: jest.fn(async () => ({ data: rows, error: null })),
});

describe('AI rate-limit Edge adapter', () => {
  it('lock RPC의 snake_case 결과를 handler 계약으로 바꾼다', async () => {
    const client = rpcClient([{ acquired: false, retry_after_seconds: 37 }]);
    await expect(acquireCourseGenerationLock(client as never, {
      userId: 'user-1', requestId: 'request-1', now: '2026-07-29T10:00:00.000Z',
    })).resolves.toEqual({ acquired: false, retryAfterSeconds: 37 });
    expect(client.rpc).toHaveBeenCalledWith('acquire_ai_request_lock', {
      p_user_id: 'user-1', p_action: 'course_generate', p_request_id: 'request-1', p_now: '2026-07-29T10:00:00.000Z',
    });
  });

  it('daily 거절의 Seoul reset 시간을 보존한다', async () => {
    const client = rpcClient([{
      allowed: false, limit_type: 'daily', retry_after_seconds: null, resets_at: '2026-07-30T15:00:00.000Z',
    }]);
    await expect(consumeCourseGenerationQuota(client as never, {
      userId: 'user-1', now: '2026-07-29T10:00:00.000Z',
    })).resolves.toEqual({ allowed: false, limitType: 'daily', resetsAt: '2026-07-30T15:00:00.000Z' });
  });

  it('RPC 오류를 quota 허용으로 오인하지 않고 throw한다', async () => {
    const client = { rpc: jest.fn(async () => ({ data: null, error: new Error('database unavailable') })) };
    await expect(consumeCourseGenerationQuota(client as never, { userId: 'user-1' }))
      .rejects.toThrow('database unavailable');
  });
});
