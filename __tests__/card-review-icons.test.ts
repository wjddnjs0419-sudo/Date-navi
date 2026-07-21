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

  // 목업(07_card_memory_new)은 4개 평점을 red/gold/green/blue로 구분한다. lock의 palette mode에
  // 맞춰 실제 hex 대신 파스텔 톤 패밀리(pink/cream/mint/lavender)로 그 의도를 재현한다.
  it('gives each rating a distinct pastel tone (love/good/ok/change)', () => {
    expect(source).toMatch(/love:[\s\S]{0,40}C\.danger/);
    expect(source).toMatch(/good:[\s\S]{0,40}C\.creamFg/);
    expect(source).toMatch(/ok:[\s\S]{0,40}C\.mintFg/);
    expect(source).toMatch(/change:[\s\S]{0,40}C\.lavenderFg/);
  });

  it('preserves the save contract (memory insert + card status flip + redirect)', () => {
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/from\('date_cards'\)\.update\(\{ status: 'done' \}\)/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
