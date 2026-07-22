// __tests__/card-memory-edit-icons.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory edit screen icons', () => {
  const source = read('app/card/memory/edit/[id].tsx');
  const feedback = read('lib/ratingFeedback.ts');

  it('imports the shared star icon and rating feedback module (no more Heart toggle)', () => {
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Star[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/ratingFeedback'/);
  });

  it('gives each rating a distinct pastel tone (bad/meh/okay/good/amazing) in the shared feedback module', () => {
    expect(feedback).toMatch(/1:[\s\S]{0,60}C\.grayFg/);
    expect(feedback).toMatch(/2:[\s\S]{0,60}C\.lavenderFg/);
    expect(feedback).toMatch(/3:[\s\S]{0,60}C\.mintFg/);
    expect(feedback).toMatch(/4:[\s\S]{0,60}C\.creamFg/);
    expect(feedback).toMatch(/5:[\s\S]{0,60}C\.danger/);
  });

  it('renders the heading heart doodle and trees mini illustration (목업 09 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<HeartDoodle/);
    expect(source).toMatch(/<Illustration name="mini-trees-heart" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (freeform title gate + rating + fields)', () => {
    const payload = source.match(/\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
    expect(payload).toContain("title: isFreeform ? (title.trim() || null) : undefined");
    expect(payload).toContain('review: reviewText.trim()');
    expect(payload).toContain('rating,');
    expect(payload).toContain('want_again: wantAgain');
    expect(payload).toContain('photo_url: photoUrl');
  });

  it('requires a star rating before saving', () => {
    expect(source).toMatch(/if \(!rating\)[\s\S]*?noStarRatingError/);
  });

  it('preserves the edit-forbidden guard', () => {
    expect(source).toMatch(/if \(!data\?\.length\)[\s\S]*?editForbidden/);
  });
});
