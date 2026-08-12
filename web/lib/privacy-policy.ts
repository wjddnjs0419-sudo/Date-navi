import type { Lang } from '@/lib/i18n';

type PolicySection = { title: string; body: string };
export type PrivacyPolicy = { title: string; updated: string; sections: PolicySection[] };

export const PRIVACY_POLICY: Record<Lang, PrivacyPolicy> = {
  ko: {
    title: '개인정보처리방침', updated: '최종 수정일: 2026년 8월 12일', sections: [
      { title: '1. 개인정보처리자 및 연락처', body: '개인정보처리자: 김정원\n개인정보 문의: jake051096@gmail.com' },
      { title: '2. 수집하는 정보', body: '소셜 로그인 계정 식별자와 이메일, 프로필의 닉네임·아바타 URL, 커플 연결 정보, 선호·데이트 계획 입력값, 카드·반응·댓글·추억과 사진, 선택한 장소·위치 정보, 서비스 이용·오류·분석 로그를 처리할 수 있습니다.' },
      { title: '3. 이용 목적', body: '정보는 로그인과 계정 관리, 커플 연결과 공유, 맞춤형 데이트 추천 및 장소 검색, 기록 저장, 보안·오류 대응과 서비스 개선을 위해 사용합니다.' },
      { title: '4. 공유 및 처리 위탁', body: '서비스 운영에 필요한 범위에서 Supabase(인증·데이터베이스·저장소), Anthropic(AI 추천에 쓰이는 프롬프트), Kakao(장소 검색), Google·Kakao(소셜 로그인)와 정보를 처리할 수 있습니다. 알림을 활성화한 경우에만 Expo 푸시 알림을 통해 알림을 전달할 수 있습니다. 개인정보를 판매하지 않습니다. 지도 또는 리뷰 보기 동작을 선택하면 카카오맵 및 네이버 외부 링크가 열리며, 해당 서비스의 약관 및 개인정보처리방침이 적용됩니다.' },
      { title: '5. 공개 업로드', body: '프로필 사진은 avatars 버킷, 추억 사진은 memories 버킷에 저장되며 두 버킷은 공개 읽기 및 공개 URL을 사용합니다. URL을 아는 사람은 로그인 없이 파일에 접근할 수 있으므로 민감한 사진이나 개인정보를 올리지 마세요.' },
      { title: '6. 권한', body: '사진·미디어 권한은 사진을 선택하거나 올릴 때, 위치 권한은 위치 기반 추천 기능을 사용할 때, 선택적 알림 권한은 푸시 알림을 받도록 설정할 때 요청될 수 있습니다. 권한은 기기 설정에서 거부하거나 철회할 수 있지만 관련 기능이 제한될 수 있습니다.' },
      { title: '7. 보관 및 삭제', body: '계정과 콘텐츠 데이터는 서비스 제공에 필요한 동안 보관됩니다. 이용자는 개별 추억을 삭제하거나 앱의 프로필 화면에서 계정 삭제를 요청할 수 있습니다. 계정 삭제 요청을 처리하며, 법령상 보관 의무 또는 백업·보안 운영에 필요한 경우에는 해당 기간 동안 일부 정보가 보관될 수 있습니다.' },
      { title: '8. 보안', body: '서비스는 인증, 데이터베이스 접근 제어 및 소유자별 업로드·수정·삭제 정책 등 합리적인 보호조치를 적용합니다. 다만 공개 읽기 버킷의 파일은 공개 URL로 접근할 수 있다는 예외가 있습니다.' },
      { title: '9. 이용자 권리 및 문의', body: '적용 법령이 허용하는 범위에서 이용자는 자신의 정보에 대한 열람, 정정, 삭제, 처리 제한 또는 이의 제기를 요청할 수 있습니다. 요청은 jake051096@gmail.com으로 보내주세요.' },
      { title: '10. 방침 변경', body: '이 방침의 내용이 변경되는 경우 앱 또는 서비스 내 공지를 통해 변경 사항과 시행일을 알립니다.' },
    ],
  },
  en: {
    title: 'Privacy Policy', updated: 'Last updated: August 12, 2026', sections: [
      { title: '1. Controller and contact', body: 'Privacy controller: Jeongwon Kim\nPrivacy contact: jake051096@gmail.com' },
      { title: '2. Data we collect', body: 'We may process your social sign-in account identifier and email; profile nickname and avatar URL; couple connection data; preferences and date-planning inputs; cards, reactions, comments, memories, and photos; selected place and location data; and service-use, error, and analytics logs.' },
      { title: '3. How we use data', body: 'We use data to provide sign-in and account management, couple connection and sharing, personalized date recommendations and place search, memory storage, and security, error response, and service improvement.' },
      { title: '4. Sharing and processing providers', body: 'As needed to operate the Service, we may process data with Supabase (authentication, database, and storage), Anthropic (prompts used for AI recommendations), Kakao (place search), and Google and Kakao (social sign-in). We may deliver Expo push notifications only when notifications are enabled. We do not sell personal information. Selecting map or review actions opens Kakao Map and Naver external links, and those services’ terms and privacy policies apply.' },
      { title: '5. Public uploads', body: 'Profile photos are stored in the avatars bucket and memory photos in the memories bucket. Both use public read access and public URLs, so anyone with a URL can access a file without signing in. Do not upload sensitive photos or personal information.' },
      { title: '6. Permissions', body: 'Photo and media permission may be requested when you select or upload a photo, location permission may be requested when you use location-based recommendations, and optional notification permission may be requested when you choose to receive push notifications. You can deny or withdraw permissions in device settings, although related features may be limited.' },
      { title: '7. Retention and deletion', body: 'Account and content data are retained while needed to provide the Service. You may delete an individual memory or request account deletion from the Profile screen in the app. We process deletion requests, while some information may be retained when required by law or necessary for backup and security operations.' },
      { title: '8. Security', body: 'We use reasonable safeguards including authentication, database access controls, and owner-based upload, update, and deletion policies. Files in public-read buckets are an exception because they can be accessed through public URLs.' },
      { title: '9. Your rights and contact', body: 'To the extent allowed by applicable law, you may request access, correction, deletion, restriction of processing, or object to processing of your data. Send requests to jake051096@gmail.com.' },
      { title: '10. Changes to this policy', body: 'If this policy changes, we will announce the changes and their effective date within the app or Service.' },
    ],
  },
};
