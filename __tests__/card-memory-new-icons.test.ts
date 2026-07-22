import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// STYLESEED lock은 lucide 단일 아이콘 패밀리를 요구한다. 목업(07_card_memory_new)의
// red/gold/green/blue 구분은 lock 파스텔 톤 패밀리로 재현한다(card/[id].tsx REACTIONS와 동일 패턴).
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory new screen icons', () => {
  const source = read('app/card/memory/new.tsx');

  it('no longer renders emoji rating or camera icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports lucide icons for rating + photo picker', () => {
    expect(source).toMatch(/import \{[^}]*Heart[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
  });

  it('gives each rating a distinct pastel tone (love/good/ok/change)', () => {
    expect(source).toMatch(/love:[\s\S]{0,40}C\.danger/);
    expect(source).toMatch(/good:[\s\S]{0,40}C\.creamFg/);
    expect(source).toMatch(/ok:[\s\S]{0,40}C\.mintFg/);
    expect(source).toMatch(/change:[\s\S]{0,40}C\.lavenderFg/);
  });

  it('renders the park-bench mini illustration next to the heading (목업 07 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<Illustration name="mini-park-bench" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (memory insert with title + photo required)', () => {
    expect(source).toMatch(/if \(!photoUrl\)[\s\S]*?photoRequiredError/);
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?card_id: null[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
