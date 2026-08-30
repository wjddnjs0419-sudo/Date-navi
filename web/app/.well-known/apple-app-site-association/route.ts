// 애플 유니버설 링크 검증 파일. 확장자 없이 application/json 으로 서빙돼야 하므로 라우트 핸들러로 제공한다.
// appID = <Apple Team ID>.<bundle id>. 초대와 외부 코스 공유 경로를 앱으로 딥링크한다.
export const dynamic = 'force-static';

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ['YQGRS8YK72.com.datenavi.app'],
        components: [
          { '/': '/invite', comment: '커플 초대 랜딩' },
          { '/': '/invite/*', comment: '커플 초대 랜딩 하위 경로' },
          { '/': '/course/*', comment: '외부 공유 코스' },
        ],
      },
    ],
  },
};

export function GET() {
  return new Response(JSON.stringify(AASA), {
    headers: { 'content-type': 'application/json' },
  });
}
