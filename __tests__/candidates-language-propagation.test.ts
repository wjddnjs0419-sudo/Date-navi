import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CandidatesScreen language propagation', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/candidates.tsx'), 'utf8');

  it('does not hardcode Korean when generating bucket cards', () => {
    expect(source).not.toContain("generateDateCards(input, 'next_meet', prefs, 'ko')");
  });

  it('passes the active app language to generateDateCards', () => {
    expect(source).toContain("generateDateCards(input, 'next_meet', prefs, language)");
  });
});
