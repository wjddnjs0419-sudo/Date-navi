import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockGetNotifPermissions = jest.fn();
const mockRequestNotifPermissions = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetNotifPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestNotifPermissions(...args),
}));

const mockGetLocPermissions = jest.fn();
const mockRequestLocPermissions = jest.fn();
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetLocPermissions(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestLocPermissions(...args),
}));

const mockRegisterPushToken = jest.fn();
jest.mock('../lib/push', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));

import { ensureStartupPermissions } from '../lib/startupPermissions';

describe('ensureStartupPermissions (로그인 확인 직후 호출)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocPermissions.mockResolvedValue({ status: 'granted', canAskAgain: false });
    mockRequestLocPermissions.mockResolvedValue({ status: 'granted' });
    mockRegisterPushToken.mockResolvedValue(undefined);
  });

  it('알림 미결정이면 팝업을 띄우고, 허용되면 즉시 푸시 토큰을 등록한다', async () => {
    mockGetNotifPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    mockRequestNotifPermissions.mockResolvedValue({ status: 'granted' });

    await ensureStartupPermissions();

    expect(mockRequestNotifPermissions).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
  });

  it('알림이 이미 허용 상태면 팝업 없이 토큰만 재등록한다 (재설치·토큰 로테이션 대응)', async () => {
    mockGetNotifPermissions.mockResolvedValue({ status: 'granted', canAskAgain: false });

    await ensureStartupPermissions();

    expect(mockRequestNotifPermissions).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
  });

  it('알림 거부 상태면 팝업도 등록도 하지 않는다', async () => {
    mockGetNotifPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await ensureStartupPermissions();

    expect(mockRequestNotifPermissions).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('알림 팝업에서 거부하면 토큰을 등록하지 않는다', async () => {
    mockGetNotifPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    mockRequestNotifPermissions.mockResolvedValue({ status: 'denied' });

    await ensureStartupPermissions();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('위치 미결정이면 팝업을 띄우고, 이미 결정됐으면 묻지 않는다', async () => {
    mockGetNotifPermissions.mockResolvedValue({ status: 'granted', canAskAgain: false });

    mockGetLocPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    await ensureStartupPermissions();
    expect(mockRequestLocPermissions).toHaveBeenCalledTimes(1);

    mockGetLocPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });
    await ensureStartupPermissions();
    expect(mockRequestLocPermissions).toHaveBeenCalledTimes(1);
  });

  it('알림 확인이 실패해도 위치 확인은 진행한다', async () => {
    mockGetNotifPermissions.mockRejectedValue(new Error('boom'));
    mockGetLocPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });

    await ensureStartupPermissions();

    expect(mockRequestLocPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('_layout 배선', () => {
  const source = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');

  it('세션 확인(초기 부팅)과 SIGNED_IN 양쪽에서 ensureStartupPermissions를 호출한다', () => {
    // 초기 부팅: 세션이 있을 때만.
    expect(source).toMatch(/if \(session && !SCREENSHOT_MODE\)\s*{[\s\S]{0,160}void ensureStartupPermissions\(\)/);
    // 로그인 이벤트.
    expect(source).toMatch(/SIGNED_IN[\s\S]{0,200}void ensureStartupPermissions\(\)/);
    // 이전 버그의 원인: 권한 미결정 시 조용히 포기하는 registerPushToken 직접 호출은 제거.
    expect(source).not.toMatch(/void registerPushToken\(\)/);
  });
});
