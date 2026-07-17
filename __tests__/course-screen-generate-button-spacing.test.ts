import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The char counter ("0/500 characters") had no bottom margin and generateButton had no top
// margin, so the Build-a-course button sat flush against the counter text whenever neither
// the preview nor validation panel rendered above it.
describe('course screen generate button spacing', () => {
  const source = readFileSync(join(process.cwd(), 'app/mode-flow/course.tsx'), 'utf8');

  it('gives the generate button breathing room above it', () => {
    const generateButton = source.match(/generateButton: \{([^}]*)\}/)?.[1] ?? '';
    expect(generateButton).toMatch(/marginTop: SP\.\w+/);
  });
});
