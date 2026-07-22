import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory new screen icons', () => {
  const source = read('app/card/memory/new.tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('no longer renders emoji rating or camera icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports the shared star icon, camera icon, and rating feedback module', () => {
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('renders the park-bench mini illustration next to the heading (목업 07 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<Illustration name="mini-park-bench" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (memory insert with title + photo + rating required)', () => {
    expect(source).toMatch(/if \(!photoUrl\)[\s\S]*?photoRequiredError/);
    expect(source).toMatch(/if \(!rating\)[\s\S]*?noStarRatingError/);
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?card_id: null[\s\S]*?rating,[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
