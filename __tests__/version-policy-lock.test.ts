import {
  createVersionPolicyLock,
  getActiveVersionPolicyLock,
  parseVersionPolicyLock,
  updateVersionPolicyLock,
  type VersionPolicyLock,
} from '../lib/version-policy-lock';

const blockedPolicy = {
  enforced: true,
  minimumIosVersion: '1.0.2',
  storeUrl: 'https://apps.apple.com/kr/app/date-navi/id6794355525',
};

const cachedLock: VersionPolicyLock = {
  minimumIosVersion: '1.0.2',
  storeUrl: blockedPolicy.storeUrl,
};

describe('version policy lock state', () => {
  it('creates a persistent lock when the current app is below the enforced minimum', () => {
    expect(createVersionPolicyLock('1.0.1', blockedPolicy)).toEqual(cachedLock);
  });

  it('keeps an existing lock when a foreground check is unavailable', () => {
    expect(updateVersionPolicyLock(cachedLock, '1.0.1', { status: 'unavailable' })).toEqual(cachedLock);
  });

  it('clears a cached lock only after a successful policy check allows the current app', () => {
    expect(updateVersionPolicyLock(cachedLock, '1.0.1', {
      status: 'success',
      policy: { ...blockedPolicy, minimumIosVersion: '1.0.1' },
    })).toBeNull();
  });

  it('does not restore a cached lock for an app that already meets its minimum', () => {
    expect(parseVersionPolicyLock(JSON.stringify(cachedLock), '1.0.2')).toBeNull();
  });

  it('restores an in-memory lock immediately when the root layout is recreated', () => {
    expect(getActiveVersionPolicyLock(cachedLock, '1.0.1')).toEqual(cachedLock);
  });
});
