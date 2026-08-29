import { buildInviteShareContent, buildInviteUrl } from '../lib/couple-invite';

describe('buildInviteShareContent', () => {
  const shareMessage = '우리 Date Navi에서 커플로 연결하고 데이트 코스 같이 정해요 💕 (초대코드 DN-ABCD)';

  it('공유 시트가 링크 프리뷰를 만들 수 있도록 URL을 message와 별도 url 아이템으로 함께 전달한다', () => {
    const content = buildInviteShareContent('DN-ABCD', 'ko', shareMessage);
    expect(content).not.toBeNull();
    expect(content!.message).toBe(`${shareMessage}\n\n${buildInviteUrl('DN-ABCD', 'ko')}`);
    expect(content!.title).toBe('Date Navi');
    expect(content!.url).toBe(buildInviteUrl('DN-ABCD', 'ko'));
  });

  it('코드가 없으면 null', () => {
    expect(buildInviteShareContent(null, 'ko', shareMessage)).toBeNull();
    expect(buildInviteShareContent('', 'en', shareMessage)).toBeNull();
  });
});
