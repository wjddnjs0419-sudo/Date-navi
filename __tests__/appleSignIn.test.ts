const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

import { signInWithApple, formatAppleFullName } from '../lib/appleAuth';
import { supabase } from '../lib/supabase';

const mockSignInWithIdToken = supabase.auth.signInWithIdToken as jest.Mock;

describe('signInWithApple', () => {
  beforeEach(() => {
    mockSignInAsync.mockReset();
    mockSignInWithIdToken.mockReset();
    mockSignInWithIdToken.mockResolvedValue({ error: null });
  });

  it('이름과 이메일 스코프를 요청한다 — 애플은 이 값을 최초 1회만 주므로 처음부터 받아야 한다', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-1', fullName: null });

    await signInWithApple();

    expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1] });
  });

  it('identityToken을 Supabase apple provider로 교환한다', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-2', fullName: null });

    const result = await signInWithApple();

    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'token-2' });
    expect(result.cancelled).toBe(false);
  });

  it('최초 로그인에서 받은 이름을 반환한다', async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: 'token-3',
      fullName: { givenName: 'Jane', familyName: 'Doe' },
    });

    const result = await signInWithApple();

    expect(result.fullName).toBe('Jane Doe');
  });

  it('재로그인처럼 이름이 없으면 fullName은 null', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-4', fullName: null });

    const result = await signInWithApple();

    expect(result.fullName).toBeNull();
  });

  it('identityToken이 없으면 NO_ID_TOKEN으로 실패한다', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null, fullName: null });

    await expect(signInWithApple()).rejects.toMatchObject({ code: 'NO_ID_TOKEN' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('Supabase 교환이 실패하면 그 에러를 그대로 던진다', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-5', fullName: null });
    mockSignInWithIdToken.mockResolvedValue({ error: { message: 'bad audience' } });

    await expect(signInWithApple()).rejects.toMatchObject({ message: 'bad audience' });
  });
});

describe('formatAppleFullName', () => {
  it('영문 이름은 이름 성 순서로 띄어쓰기해 붙인다', () => {
    expect(formatAppleFullName({ givenName: 'Jane', familyName: 'Doe' })).toBe('Jane Doe');
  });

  // 한글은 성이 앞이고 띄어쓰지 않는다. Apple은 locale과 무관하게 given/family로 쪼개 준다.
  it('한글 이름은 성 이름 순서로 붙여 쓴다', () => {
    expect(formatAppleFullName({ givenName: '정원', familyName: '김' })).toBe('김정원');
  });

  it('한쪽만 있으면 그것만 쓴다', () => {
    expect(formatAppleFullName({ givenName: 'Jane', familyName: null })).toBe('Jane');
    expect(formatAppleFullName({ givenName: null, familyName: '김' })).toBe('김');
  });

  it('둘 다 없거나 공백뿐이면 null', () => {
    expect(formatAppleFullName(null)).toBeNull();
    expect(formatAppleFullName({ givenName: '  ', familyName: '' })).toBeNull();
  });
});
