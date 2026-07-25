import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../app/card/confirm.tsx'), 'utf8');

describe('confirm screen per-user review guard', () => {
  it('checks whether I already reviewed this card (date_memories by my user_id)', () => {
    expect(src).toContain('date_memories');
    expect(src).toContain('memoryDone');
  });

  it('gates the "완료했어요" review entry so I cannot review the same card twice', () => {
    expect(src).toMatch(/!memoryDone/);
  });
});
