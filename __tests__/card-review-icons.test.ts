import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// STYLESEED lock은 lucide 단일 아이콘 패밀리를 요구한다 — 평점 카드의 이모지를 lucide로 교체한다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card review screen icons', () => {
  const source = read('app/card/review.tsx');

  it('no longer renders emoji rating icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports lucide icons for the rating row', () => {
    expect(source).toMatch(/import \{[^}]*Heart[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
  });

  it('preserves the save contract (memory insert + card status flip + redirect)', () => {
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/from\('date_cards'\)\.update\(\{ status: 'done' \}\)/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
