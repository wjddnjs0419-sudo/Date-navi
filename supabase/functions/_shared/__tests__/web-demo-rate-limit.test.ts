import {
  acquireWebDemoPermit,
  consumeWebDemoLocationQuota,
  finishWebDemoPermit,
  type WebDemoRateLimitRpcClient,
} from '../web-demo-rate-limit';

const visitorHash = 'a'.repeat(64);
const networkHash = 'b'.repeat(64);

function rpcClient(data: unknown): WebDemoRateLimitRpcClient & { rpc: jest.Mock } {
  return {
    rpc: jest.fn(async () => ({ data, error: null })),
  };
}

describe('web demo anonymous rate-limit adapter', () => {
  it('returns a permit for an allowed initial recommendation and sends configured limits', async () => {
    const client = rpcClient([{
      allowed: true,
      permit_id: 'permit-1',
      owner_token: 'owner-1',
    }]);

    await expect(acquireWebDemoPermit(client, {
      visitorHash,
      networkHash,
      requestId: 'request-1',
      globalLimit: 500,
      now: '2026-09-01T00:00:00.000Z',
    })).resolves.toEqual({ permitId: 'permit-1', ownerToken: 'owner-1' });

    expect(client.rpc).toHaveBeenCalledWith('acquire_web_demo_permit', expect.objectContaining({
      p_visitor_hash: visitorHash,
      p_network_hash: networkHash,
      p_request_id: 'request-1',
      p_attempt: 0,
      p_visitor_limit: 3,
      p_network_limit: 30,
      p_global_limit: 500,
      p_stale_after_seconds: 120,
      p_now: '2026-09-01T00:00:00.000Z',
    }));
  });

  it.each([
    ['visitor daily', 'visitor', 'WEB_DEMO_DAILY_LIMIT'],
    ['network daily', 'network', 'WEB_DEMO_NETWORK_LIMIT'],
    ['global daily', 'global', 'WEB_DEMO_GLOBAL_LIMIT'],
    ['active lease', 'already_running', 'WEB_DEMO_ALREADY_RUNNING'],
  ])('maps %s rejection to a stable error code', async (_label, limitType, code) => {
    const client = rpcClient([{ allowed: false, limit_type: limitType, retry_after_seconds: 42 }]);

    await expect(acquireWebDemoPermit(client, {
      visitorHash,
      networkHash,
      requestId: 'request-rejected',
    })).rejects.toMatchObject({ code });
  });

  it('does not include opaque hashes in errors and rejects malformed identities', async () => {
    const client = rpcClient([{ allowed: false, limit_type: 'visitor', retry_after_seconds: 42 }]);

    await expect(acquireWebDemoPermit(client, {
      visitorHash: `${visitorHash}raw-ip-must-not-leak`,
      networkHash,
      requestId: 'request-invalid',
    })).rejects.toThrow();
    await expect(acquireWebDemoPermit(client, {
      visitorHash: 'not-a-hash',
      networkHash,
      requestId: 'request-invalid',
    })).rejects.not.toThrow(visitorHash);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('marks attempt 1 as a retry that skips visitor/network consumption but keeps the global count', async () => {
    const client = rpcClient([{
      allowed: true,
      permit_id: 'permit-retry',
      owner_token: 'owner-retry',
    }]);

    await acquireWebDemoPermit(client, {
      visitorHash,
      networkHash,
      requestId: 'request-retry',
      attempt: 1,
    });

    expect(client.rpc).toHaveBeenCalledWith('acquire_web_demo_permit', expect.objectContaining({
      p_attempt: 1,
      p_count_visitor: false,
      p_count_network: false,
      p_count_global: true,
    }));
  });

  it('finishes success and failure permits with compare-and-delete owner data', async () => {
    const client = rpcClient([{ released: true }]);

    await finishWebDemoPermit(client, 'permit-1', 'owner-1', 'success');
    await finishWebDemoPermit(client, 'permit-2', 'owner-2', 'failure');

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'finish_web_demo_permit', {
      p_permit_id: 'permit-1',
      p_owner_token: 'owner-1',
      p_outcome: 'success',
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'finish_web_demo_permit', {
      p_permit_id: 'permit-2',
      p_owner_token: 'owner-2',
      p_outcome: 'failure',
    });
  });

  it('never calls the authenticated mobile quota RPCs', async () => {
    const client = rpcClient([{ allowed: true, permit_id: 'permit-1', owner_token: 'owner-1' }]);

    await acquireWebDemoPermit(client, { visitorHash, networkHash, requestId: 'request-1' });
    await finishWebDemoPermit(client, 'permit-1', 'owner-1', 'success');

    expect(client.rpc.mock.calls.map(([name]) => name)).not.toEqual(expect.arrayContaining([
      'acquire_ai_request_lock',
      'consume_ai_quota',
      'release_ai_request_lock',
      'release_ai_quota',
    ]));
  });

  it('uses separate location-search limits and maps its three scopes', async () => {
    const client = rpcClient([{ allowed: true }]);

    await consumeWebDemoLocationQuota(client, {
      visitorHash,
      networkHash,
      now: '2026-09-01T00:00:00.000Z',
    });

    expect(client.rpc).toHaveBeenCalledWith('consume_web_demo_location_quota', {
      p_visitor_hash: visitorHash,
      p_network_hash: networkHash,
      p_visitor_limit: 60,
      p_network_limit: 300,
      p_global_limit: 3000,
      p_now: '2026-09-01T00:00:00.000Z',
    });
  });
});
