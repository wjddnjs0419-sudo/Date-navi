import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockGetUser = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => ({
      delete: (...args: unknown[]) => {
        mockDelete(table, ...args);
        return { eq: (...eqArgs: unknown[]) => mockEq(...eqArgs) };
      },
      upsert: jest.fn(),
    }),
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'p1' } } } }));

import { buildPushNavigationTarget, unregisterPushToken } from '../lib/push';

describe('buildPushNavigationTarget', () => {
  it('new_card(데이트 제안) 타입이면 알림함으로 (모달에서 문구 확인)', () => {
    expect(buildPushNavigationTarget('new_card', { card_id: 'abc' })).toBe('/account/notifications');
  });

  it('reaction 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('reaction', { card_id: 'xyz' })).toBe('/card/xyz');
  });

  it('soft_message(legacy) 타입이면 알림함으로', () => {
    expect(buildPushNavigationTarget('soft_message', {})).toBe('/account/notifications');
  });
});

describe('unregisterPushToken (로그아웃 시 계정-기기 매핑 제거)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('현재 유저의 push_tokens 행을 삭제한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockEq.mockResolvedValue({ error: null });

    await unregisterPushToken();

    expect(mockDelete).toHaveBeenCalledWith('push_tokens');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('유저가 없으면 아무것도 하지 않는다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await unregisterPushToken();

    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('push_tokens delete RLS 마이그레이션', () => {
  it('본인 행 delete 정책이 존재한다 (로그아웃 토큰 삭제에 필요)', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const dir = join(__dirname, '../supabase/migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/create policy "push_tokens_delete_self" on public\.push_tokens[\s\S]{0,120}for delete[\s\S]{0,120}auth\.uid\(\) = user_id/);
  });
});

describe('settings 배선', () => {
  const source = readFileSync(join(__dirname, '../app/settings.tsx'), 'utf8');

  it('알림 권한 granted 직후 푸시 토큰을 등록한다 (이전 버그: 권한만 켜지고 토큰 미등록)', () => {
    expect(source).toMatch(/res\.status === 'granted'[\s\S]{0,120}registerPushToken\(\)/);
  });

  it('로그아웃 시 signOut 전에 토큰을 삭제한다 (signOut 후엔 RLS로 본인 행 삭제 불가)', () => {
    expect(source).toMatch(/unregisterPushToken\(\)[\s\S]{0,120}signOut\(\)/);
  });
});

describe('couple-connect 배선 (또 다른 로그아웃 경로)', () => {
  it('온보딩 로그아웃도 signOut 전에 토큰을 삭제한다', () => {
    const source = readFileSync(join(__dirname, '../app/onboarding/couple-connect.tsx'), 'utf8');
    expect(source).toMatch(/unregisterPushToken\(\)[\s\S]{0,120}signOut\(\)/);
  });
});
