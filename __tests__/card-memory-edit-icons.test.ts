import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 목업(09_card_memory_edit)은 사진 자리에 카메라 아이콘, "다시 하고 싶어요?" 버튼에 하트 아이콘을 쓴다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card memory edit screen icons', () => {
  const source = read('app/card/memory/edit/[id].tsx');

  it('imports lucide Camera and Heart icons', () => {
    expect(source).toMatch(/import \{[^}]*Camera[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*Heart[^}]*\} from 'lucide-react-native'/);
  });

  it('renders a Heart icon inside the want-again toggle row', () => {
    expect(source).toMatch(/wantAgainRow[\s\S]*?<Heart/);
  });

  it('renders the heading heart doodle and trees mini illustration (목업 09 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<HeartDoodle/);
    expect(source).toMatch(/<Illustration name="mini-trees-heart" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('preserves the save contract (freeform title gate + fields)', () => {
    const payload = source.match(/\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
    expect(payload).toContain("title: isFreeform ? (title.trim() || null) : undefined");
    expect(payload).toContain('review: reviewText.trim()');
    expect(payload).toContain('want_again: wantAgain');
    expect(payload).toContain('photo_url: photoUrl');
  });

  it('preserves the edit-forbidden guard', () => {
    expect(source).toMatch(/if \(!data\?\.length\)[\s\S]*?editForbidden/);
  });
});
