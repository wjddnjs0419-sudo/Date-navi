import { buildInviteShareContent, buildInviteUrl } from '../lib/couple-invite';

describe('buildInviteShareContent', () => {
  const shareMessage = '우리 Date Navi에서 커플로 연결하고 데이트 코스 같이 정해요 💕 (초대코드 DN-ABCD)';

  it('URL은 message 텍스트에만 싣고 별도 url 필드는 없다 (카카오는 텍스트 URL만 프리뷰, url 아이템은 무시 — 실기기 확인. 양쪽에 있으면 카드 2개)', () => {
    const content = buildInviteShareContent('DN-ABCD', 'ko', shareMessage);
    expect(content).not.toBeNull();
    expect(content!.message).toBe(`${shareMessage}\n\n${buildInviteUrl('DN-ABCD', 'ko')}`);
    expect(content!.title).toBe('Date Navi');
    expect('url' in content!).toBe(false);
  });

  it('코드가 없으면 null', () => {
    expect(buildInviteShareContent(null, 'ko', shareMessage)).toBeNull();
    expect(buildInviteShareContent('', 'en', shareMessage)).toBeNull();
  });
});
