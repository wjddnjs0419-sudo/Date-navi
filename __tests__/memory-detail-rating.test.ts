import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../app/card/memory/[id].tsx'), 'utf8');

describe('memory detail rating', () => {
  it('selects the rating column from date_memories', () => {
    expect(src).toMatch(/select\([^)]*rating/);
  });

  it('renders the star rating for the memory', () => {
    expect(src).toContain('StarRating');
    expect(src).toContain('memory.rating');
  });
});
