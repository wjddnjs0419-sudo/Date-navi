import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('settings screen back navigation', () => {
  const source = readFileSync(join(__dirname, '../app/settings.tsx'), 'utf8');

  it('imports the shared Header from shared ui', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bHeader\b[^}]*\}\s*from\s*'\.\.\/components\/ui'/);
  });

  it('uses the shared back Header on Settings and My page', () => {
    expect(source).toContain('<Header onBack={() => router.back()} />');
    expect(source).toContain('<ScreenHeading title={t.heading} />');
  });
});
