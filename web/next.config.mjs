/** @type {import('next').NextConfig} */
const nextConfig = {
  // 상위(RN 앱) 리포에 lockfile이 또 있어 Next가 워크스페이스 루트를 오인하지 않도록 고정.
  outputFileTracingRoot: import.meta.dirname,
  // OG 라우트가 fs로 읽는 폰트·마스코트를 서버리스 번들에 반드시 포함.
  outputFileTracingIncludes: {
    '/api/og': ['./assets/Pretendard-Bold.subset.otf', './public/mascot.png'],
  },
  async redirects() {
    return [
      // 루트로 들어오면 초대 랜딩으로.
      { source: '/', destination: '/invite', permanent: false },
    ];
  },
};

export default nextConfig;
