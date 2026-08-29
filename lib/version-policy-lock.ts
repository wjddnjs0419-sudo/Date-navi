import { isMinimumAppVersionMet } from './minimum-app-version';

export const VERSION_POLICY_LOCK_STORAGE_KEY = '@date-navi/version-policy-lock';

export type VersionPolicy = {
  enforced: boolean;
  minimumIosVersion: string;
  storeUrl: string;
};

export type VersionPolicyLock = {
  minimumIosVersion: string;
  storeUrl: string;
};

export type VersionPolicyCheckResult =
  | { status: 'success'; policy: VersionPolicy }
  | { status: 'unavailable' };

export function getActiveVersionPolicyLock(
  lock: VersionPolicyLock | null,
  currentIosVersion: string,
): VersionPolicyLock | null {
  if (!lock) return null;

  try {
    return isMinimumAppVersionMet(currentIosVersion, lock.minimumIosVersion) ? null : lock;
  } catch {
    return null;
  }
}

export function createVersionPolicyLock(
  currentIosVersion: string,
  policy: VersionPolicy,
): VersionPolicyLock | null {
  try {
    if (!policy.enforced || !policy.storeUrl || isMinimumAppVersionMet(currentIosVersion, policy.minimumIosVersion)) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    minimumIosVersion: policy.minimumIosVersion,
    storeUrl: policy.storeUrl,
  };
}

export function parseVersionPolicyLock(
  raw: string | null,
  currentIosVersion: string,
): VersionPolicyLock | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Partial<VersionPolicyLock>;
    if (typeof candidate.minimumIosVersion !== 'string' || typeof candidate.storeUrl !== 'string' || !candidate.storeUrl) {
      return null;
    }
    return getActiveVersionPolicyLock({
      minimumIosVersion: candidate.minimumIosVersion,
      storeUrl: candidate.storeUrl,
    }, currentIosVersion);
  } catch {
    return null;
  }
}

export function updateVersionPolicyLock(
  currentLock: VersionPolicyLock | null,
  currentIosVersion: string,
  result: VersionPolicyCheckResult,
): VersionPolicyLock | null {
  if (result.status === 'unavailable') return currentLock;
  return createVersionPolicyLock(currentIosVersion, result.policy);
}
