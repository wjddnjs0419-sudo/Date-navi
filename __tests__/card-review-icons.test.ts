import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card review screen icons', () => {
  const source = read('app/card/review.tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('no longer renders emoji rating icons', () => {
    expect(source).not.toContain('❤️');
    expect(source).not.toContain('⭐');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('🔄');
  });

  it('imports the shared star icon and rating feedback module', () => {
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('preserves the save contract (memory insert + card status flip + redirect)', () => {
    expect(source).toMatch(/from\('date_memories'\)\.insert\(\{[\s\S]*?want_again: wantAgain/);
    expect(source).toMatch(/from\('date_cards'\)\.update\(\{ status: 'done' \}\)/);
    expect(source).toMatch(/router\.replace\('\/\(tabs\)\/memories'\)/);
  });
});
