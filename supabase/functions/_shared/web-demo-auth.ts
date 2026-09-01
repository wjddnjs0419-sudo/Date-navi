const encoder = new TextEncoder();

function fixedTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function hasValidWebDemoToken(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  return fixedTimeEqual(provided, expected);
}

export function isWebDemoHash(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function hasValidWebDemoPrincipal(value: string | null | undefined): value is 'web-demo' {
  return value === 'web-demo';
}

export type GenerateAiAccess = 'mobile' | 'web-demo' | 'forbidden';

export function resolveGenerateAiAccess(input: {
  principal: string | null | undefined;
  authenticatedUserId: string | null | undefined;
  internalTokenValid: boolean;
  action: string;
}): GenerateAiAccess {
  if (input.principal) {
    return input.principal === 'web-demo'
      && input.internalTokenValid
      && input.action === 'recommend_date_select'
      ? 'web-demo'
      : 'forbidden';
  }
  if (!input.authenticatedUserId) return 'forbidden';
  // A JWT-authenticated mobile caller remains valid for recommendation
  // selection; the internal token is still required for the non-recommendation
  // server action, preserving its existing service boundary.
  return input.action === 'recommend_date_select' || input.internalTokenValid ? 'mobile' : 'forbidden';
}
