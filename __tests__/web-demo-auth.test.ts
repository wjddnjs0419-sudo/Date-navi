import {
  hasValidWebDemoToken,
  resolveGenerateAiAccess,
} from '../supabase/functions/_shared/web-demo-auth';

describe('web demo authentication boundary', () => {
  it('compares the internal token and rejects missing credentials', () => {
    expect(hasValidWebDemoToken('internal-secret', 'internal-secret')).toBe(true);
    expect(hasValidWebDemoToken('wrong', 'internal-secret')).toBe(false);
    expect(hasValidWebDemoToken(undefined, 'internal-secret')).toBe(false);
  });

  it.each([
    [{ principal: null, authenticatedUserId: 'user-1', internalTokenValid: false, action: 'recommend_date_select' }, 'mobile'],
    [{ principal: null, authenticatedUserId: 'user-1', internalTokenValid: true, action: 'recommend_date_select' }, 'mobile'],
    [{ principal: 'web-demo', authenticatedUserId: null, internalTokenValid: true, action: 'recommend_date_select' }, 'web-demo'],
    [{ principal: 'web-demo', authenticatedUserId: null, internalTokenValid: false, action: 'recommend_date_select' }, 'forbidden'],
    [{ principal: null, authenticatedUserId: null, internalTokenValid: false, action: 'recommend_date_select' }, 'forbidden'],
    [{ principal: 'other', authenticatedUserId: null, internalTokenValid: true, action: 'recommend_date_select' }, 'forbidden'],
    [{ principal: 'web-demo', authenticatedUserId: null, internalTokenValid: true, action: 'estimate_place_price' }, 'forbidden'],
  ])('resolves access for %j', (input, expected) => {
    expect(resolveGenerateAiAccess(input as Parameters<typeof resolveGenerateAiAccess>[0])).toBe(expected);
  });
});
