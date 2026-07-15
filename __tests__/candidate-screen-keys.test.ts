import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CandidatesScreen tag keys', () => {
  it('scopes tag keys to the card and occurrence instead of the tag label alone', () => {
    const source = readFileSync(join(process.cwd(), 'app/(tabs)/candidates.tsx'), 'utf8');

    expect(source).not.toContain('<Chip key={tag} tone="gray">{tag}</Chip>');
    expect(source).toContain('key={`${card.id}-${tag}-${tagIndex}`}');
  });
});
