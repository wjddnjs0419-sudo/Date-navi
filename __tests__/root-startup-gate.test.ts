import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('root startup', () => {
  it('does not replace the app with a loading spinner while checking version policy', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

    expect(layoutSource).not.toContain('if (!versionPolicyChecked)');
  });

  it('keeps the version lock across foreground checks and protects it from routing', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

    expect(layoutSource).toContain("AppState.addEventListener('change'");
    expect(layoutSource).toContain('VERSION_POLICY_LOCK_STORAGE_KEY');
    expect(layoutSource).toContain('updateStoreUrlRef.current');
  });

  it('does not mount the normal navigation tree before the initial policy check finishes', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

    expect(layoutSource).toContain('versionPolicyReady');
    expect(layoutSource).toContain('if (!versionPolicyReady)');
  });
});
