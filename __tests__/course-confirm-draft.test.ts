import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');
const candidates = readFileSync(join(__dirname, '../app/(tabs)/candidates.tsx'), 'utf8');

describe('course confirm stays a draft until saved or sent', () => {
  it('marks a just-confirmed course card as draft so it is not yet a candidate', () => {
    expect(src).toMatch(/status:\s*'draft'/);
  });

  it('promotes the card to active when the user saves or sends', () => {
    expect(src).toMatch(/status:\s*'active'/);
  });

  it('candidates only lists active cards, so draft (confirmed-but-unsaved) courses stay hidden', () => {
    expect(candidates).toMatch(/eq\(\s*'status',\s*'active'\s*\)/);
  });
});
