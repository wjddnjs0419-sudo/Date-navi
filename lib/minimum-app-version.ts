const VERSION_PATTERN = /^[0-9](?:[.][0-9]){0,2}$/;

function parseAppVersion(value: string): [number, number, number] {
  if (!VERSION_PATTERN.test(value)) throw new Error('Invalid app version');
  const parts = value.split('.').map(Number);
  return [parts[0], parts[1] ?? 0, parts[2] ?? 0];
}

export function compareAppVersions(current: string, minimum: string): number {
  const a = parseAppVersion(current);
  const b = parseAppVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function isMinimumAppVersionMet(current: string, minimum: string): boolean {
  return compareAppVersions(current, minimum) >= 0;
}
