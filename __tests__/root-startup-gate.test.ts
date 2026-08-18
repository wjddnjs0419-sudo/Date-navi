import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('root startup', () => {
  it('does not replace the app with a loading spinner while checking version policy', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

    expect(layoutSource).not.toContain('if (!versionPolicyChecked)');
  });
});
