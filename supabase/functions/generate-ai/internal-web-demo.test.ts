import { resolveGenerateAiAccess } from '../_shared/web-demo-auth.ts';

Deno.test('allows a JWT-only mobile recommendation', () => {
  if (resolveGenerateAiAccess({
    principal: null,
    authenticatedUserId: 'user-1',
    internalTokenValid: false,
    action: 'recommend_date_select',
  }) !== 'mobile') throw new Error('mobile JWT recommendation should be allowed');
});

Deno.test('allows a JWT plus internal-token mobile request', () => {
  if (resolveGenerateAiAccess({
    principal: null,
    authenticatedUserId: 'user-1',
    internalTokenValid: true,
    action: 'recommend_date_select',
  }) !== 'mobile') throw new Error('mobile internal request should be allowed');
});

Deno.test('allows only the exact web-demo principal with a valid internal token', () => {
  if (resolveGenerateAiAccess({
    principal: 'web-demo',
    authenticatedUserId: null,
    internalTokenValid: true,
    action: 'recommend_date_select',
  }) !== 'web-demo') throw new Error('web demo selection should be allowed');
});

Deno.test('rejects an invalid web-demo token or principal', () => {
  for (const principal of ['web-demo', 'other-principal']) {
    if (resolveGenerateAiAccess({
      principal,
      authenticatedUserId: null,
      internalTokenValid: false,
      action: 'recommend_date_select',
    }) !== 'forbidden') throw new Error('invalid web credentials should be rejected');
  }
});

Deno.test('rejects requests with neither credential and keeps web limited to selection', () => {
  if (resolveGenerateAiAccess({
    principal: null,
    authenticatedUserId: null,
    internalTokenValid: false,
    action: 'recommend_date_select',
  }) !== 'forbidden') throw new Error('missing credentials should be rejected');
  if (resolveGenerateAiAccess({
    principal: 'web-demo',
    authenticatedUserId: null,
    internalTokenValid: true,
    action: 'estimate_place_price',
  }) !== 'forbidden') throw new Error('web demo must not use price estimation');
});
