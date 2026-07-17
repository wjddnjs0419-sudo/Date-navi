import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('settings screen back navigation', () => {
  const source = readFileSync(join(__dirname, '../app/settings.tsx'), 'utf8');

  it('imports BackBar from shared ui', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bBackBar\b[^}]*\}\s*from\s*'\.\.\/components\/ui'/);
  });

  it('renders BackBar with large touch target', () => {
    expect(source).toContain('<BackBar largeTouchTarget />');
  });
});
