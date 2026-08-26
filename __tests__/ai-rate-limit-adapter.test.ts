import {
  acquireCourseGenerationLock,
  consumeCourseGenerationQuota,
  releaseCourseGenerationQuota,
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

  it('허용 결과의 quota reservation id를 보존하고 정확한 reservation을 반환한다', async () => {
    const client = rpcClient([{ allowed: true, consumption_id: 42 }]);
    await expect(consumeCourseGenerationQuota(client as never, {
      userId: 'user-1', requestId: 'request-1', now: '2026-07-29T10:00:00.000Z',
    })).resolves.toEqual({ allowed: true, consumptionId: 42 });
    expect(client.rpc).toHaveBeenCalledWith('consume_ai_quota', {
      p_user_id: 'user-1', p_action: 'course_generate', p_request_id: 'request-1', p_now: '2026-07-29T10:00:00.000Z',
    });

    await releaseCourseGenerationQuota(client as never, { userId: 'user-1', consumptionId: 42 });
    expect(client.rpc).toHaveBeenLastCalledWith('release_ai_quota', {
      p_user_id: 'user-1', p_action: 'course_generate', p_consumption_id: 42,
    });
  });

  it('RPC 오류를 quota 허용으로 오인하지 않고 throw한다', async () => {
    const client = { rpc: jest.fn(async () => ({ data: null, error: new Error('database unavailable') })) };
    await expect(consumeCourseGenerationQuota(client as never, { userId: 'user-1' }))
      .rejects.toThrow('database unavailable');
  });

  it('ISO 형식이 아닌 daily reset은 fail closed 한다', async () => {
    const client = rpcClient([{
      allowed: false, limit_type: 'daily', retry_after_seconds: null, resets_at: '2026/07/30 15:00:00',
    }]);
    await expect(consumeCourseGenerationQuota(client as never, { userId: 'user-1' }))
      .rejects.toThrow('invalid reset timestamp');
  });

  it('calendar-invalid ISO-shaped daily reset도 fail closed 한다', async () => {
    const client = rpcClient([{
      allowed: false, limit_type: 'daily', retry_after_seconds: null, resets_at: '2026-02-30T00:00:00Z',
    }]);
    await expect(consumeCourseGenerationQuota(client as never, { userId: 'user-1' }))
      .rejects.toThrow('invalid reset timestamp');
  });
});
