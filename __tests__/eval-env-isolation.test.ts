import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI evaluation environment isolation', () => {
  it('keeps the service-role evaluation environment outside Expo root env discovery', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['eval:ai-logs']).toContain('--env-file=scripts/.env.eval.local');
    expect(existsSync(join(process.cwd(), '.env.eval.local'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'scripts/.env.eval.local.example'))).toBe(true);
  });
});
