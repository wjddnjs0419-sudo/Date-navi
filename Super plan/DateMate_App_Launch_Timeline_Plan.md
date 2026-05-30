DateMate 앱 배포 타임라인 실행 계획서
하루 2~3시간 투자 기준 · Claude Code / Codex / Gemini CLI 활용

1. 전제 및 최종 목표
본 계획서는 커플 데이트 플래닝 앱 DateMate를 MVP 수준으로 개발하여 App Store와 Google Play에 소프트 런칭하는 것을 목표로 한다. 하루 2~3시간을 꾸준히 투자하는 1인 또는 소규모 개발 환경을 기준으로 작성했다.
•	총 기간: 12~16주
•	12주차 목표: 클로즈드 베타 가능 버전 완성
•	16주차 목표: App Store / Google Play 소프트 런칭
•	개발 도구: Claude Code, Codex, Gemini CLI 중심 활용
•	초기 핵심 검증: 앱이 실제로 데이트 계획 부담을 줄여주는가
2. 전체 타임라인 요약
기간	목표	주요 산출물
1주차	개발 범위 확정, 기술 스택 확정, 화면/DB 구조 정리	MVP 범위표, 화면 목록, DB 초안, API 목록
2~3주차	기본 앱 구조, 인증, 커플 연결 구현	로그인, 초대 코드, 기본 탭 구조
4~5주차	데이트 모드, 느낌 입력, 데이트 카드 생성	AI 없는 템플릿 기반 카드 생성
6~7주차	LLM 연동, AI 카드 생성, 내 마음 문장 만들기	AI 추천/문장 생성 서버 연동
8~9주차	상대 반응, 우리 후보, 푸시 알림, 추억 저장	커플 상호작용 완성
10~11주차	QA, 예외 처리, 개인정보/보안, 사용성 개선	내부 테스트 가능 버전
12주차	클로즈드 베타 배포	10~30쌍 테스트 및 피드백 수집
13~14주차	베타 피드백 반영	핵심 UX 개선, 불필요 기능 제거
15~16주차	스토어 등록 및 소프트 런칭	App Store / Google Play 배포

3. MVP 개발 범위
3.1 1차 배포 필수 기능
1.	회원가입 / 로그인
2.	커플 초대 코드 연결
3.	기본 취향 온보딩
4.	오늘 필요한 도움 선택
5.	느낌 입력
6.	AI 데이트 카드 생성
7.	부담 없는 반응 남기기
8.	내 마음 문장 만들기
9.	우리 후보 모아보기
10.	푸시 알림
11.	데이트 완료/저장
3.2 1차 배포에서 제외할 기능
•	네이버 지도 API 직접 연동
•	Google Places API 직접 연동
•	SNS 바이럴 장소 추천
•	커뮤니티
•	채팅
•	결제
•	고급 취향 리포트
•	캐릭터 성장
•	복잡한 캘린더
4. 추천 기술 스택
영역	추천 스택	이유
앱	React Native + Expo	MVP 속도와 AI 도구 활용 효율을 고려한 추천안
백엔드	Supabase	인증, DB, 스토리지, Edge Functions를 빠르게 구성 가능
DB	Supabase PostgreSQL	users, couples, date_cards, reactions 등 관계형 데이터에 적합
AI 서버	Supabase Edge Functions 또는 FastAPI	LLM API 키 보호 및 서버 측 호출 관리
LLM	OpenAI mini급 모델 중심	느낌 해석, 카드 생성, 문장 생성에 사용
푸시	Firebase Cloud Messaging	상대 반응/카드 생성 알림 처리
분석	Firebase Analytics 또는 PostHog	핵심 이벤트 추적
배포	Expo EAS Build	iOS/Android 빌드 및 스토어 제출 간소화

5. 주차별 실행 계획
1주차: 기획 정리 & 개발 준비
•	MVP 기능 최종 확정 및 제외 기능 명확화
•	주요 유저 플로우 4개 확정: 가입/커플 연결, 온보딩/모드 선택, 느낌 입력/카드 생성, 상대 반응/후보 저장
•	DB 테이블 설계 및 API 목록 작성
•	GitHub repo, Expo 프로젝트, Supabase 프로젝트 생성
•	환경변수와 기본 폴더 구조 세팅
산출물: 로그인하고, 연인과 연결되고, 첫 데이트 카드 하나를 만들 수 있는 앱의 기반 만들기
2~3주차: 앱 기본 구조 구현
•	이메일/Apple/Google 로그인 구현. 카카오는 이후 추가 가능
•	초대 코드 생성 및 입력 기반 커플 연결 구현
•	홈, 데이트 모드, 우리 후보, 마음 전하기, 추억 탭 구성
•	users, couples, couple_members 기본 CRUD 구현
•	로그아웃 및 회원 탈퇴 기본 구조 마련
산출물: 로그인, 커플 연결, 기본 탭 이동이 가능한 앱
4~5주차: 핵심 UX 구현
•	오늘 필요한 도움 선택 화면 구현
•	느낌 입력: 텍스트, 선택지, 예산, 거리, 컨디션, 피하고 싶은 조건
•	AI 없이 템플릿 기반 데이트 카드 생성 구현
•	date_cards 테이블 저장 및 상대방 조회 구현
•	카드 상세 화면과 기본 카드 디자인 완성
산출물: 사용자가 느낌을 입력하면 데이트 카드가 생성되고 저장되는 흐름
6~7주차: LLM 연동
•	앱에서 직접 LLM을 호출하지 않고 서버를 통해 호출
•	느낌 입력을 구조화된 JSON으로 변환
•	AI 데이트 카드 생성: 제목, 요약, 예상 시간, 예상 비용, 태그, 추천 이유
•	내 마음 문장 만들기 구현
•	LLM 실패 시 템플릿 fallback 구현
•	응답 JSON 파싱, 에러 처리, 호출 제한 로직 추가
산출물: AI 카드 생성과 부드러운 문장 생성이 실제로 작동하는 버전
8~9주차: 커플 상호작용 기능
•	부담 없는 반응 버튼 구현
•	reactions 테이블 저장 및 카드별 반응 표시
•	둘 다 끌린 후보, 조건부 후보, 다음에 좋은 후보 분류
•	상대 카드 생성/반응/매칭 후보 발생 시 푸시 알림
•	데이트 완료 처리, 한 줄 후기, 다시 하고 싶은지 저장
산출물: 둘이 함께 사용하는 앱 경험 완성
10~11주차: QA & 앱 완성도 개선
•	로그인 실패, 커플 코드 오류, 이미 연결된 유저, AI 응답 실패 등 예외 처리
•	로딩 상태, 빈 화면, 에러 메시지, AI 생성 중 애니메이션 개선
•	개인정보처리방침, 이용약관, 데이터 삭제 정책 작성
•	핵심 이벤트 로그 수집: signup, couple_connected, mode_selected, ai_card_created 등
•	내부 테스트 및 치명적 오류 수정
산출물: 클로즈드 베타에 배포할 수 있는 안정적인 앱
12주차: 클로즈드 베타
•	실제 커플 10~30쌍 모집
•	장거리 커플, 데이트 계획 쏠림 커플, 대학생/사회초년생 커플 우선 테스트
•	구글폼 또는 앱 내 피드백 수집
•	정량 지표와 정성 피드백 동시 확인
•	사용률 낮은 기능과 개선 필요 기능 분류
산출물: 베타 피드백 리포트와 개선 우선순위 목록
13~14주차: 베타 피드백 반영
•	AI 추천 문장 자연스럽게 수정
•	반응 버튼 개수 줄이기 또는 문구 개선
•	온보딩 질문 축소
•	카드 생성 과정 단축
•	상대에게 보내기 전 미리보기 개선
•	사용률 낮은 모드 제거 또는 통합
산출물: 사용자가 “데이트 정할 때 진짜 편하다”고 느끼는 버전
15~16주차: 정식 배포 준비
•	앱 이름, 아이콘, 스플래시 이미지, 스크린샷 준비
•	App Store / Google Play 앱 설명, 키워드, 개인정보 고지 작성
•	테스트 계정, 연령 등급, 데이터 수집 항목 등록
•	Expo EAS Build로 iOS/Android 빌드 생성
•	소프트 런칭 후 커뮤니티/숏폼 중심 유입 시작
산출물: App Store / Google Play 소프트 런칭
6. 주간 작업 루틴
시간	작업
평일 30분	오늘 할 일 정리, AI 도구에 넘길 단위 작업 작성
평일 90분	기능 구현, AI 도구로 코드 생성/수정, 직접 실행 확인
평일 30분	버그 기록, 커밋, 다음 작업 메모
주말 3~4시간 가능 시	주간 통합 테스트, 화면 다듬기, DB/API 정리, 다음 주 작업 분해

7. AI 코딩 도구 활용 전략
도구	주요 활용	예시 프롬프트
Claude Code	기능 단위 구현, 리팩토링, 프로젝트 구조 파악, UI 흐름 구현	“데이트 카드 생성 플로우를 구현해줘. Supabase schema 기준으로 API 함수, 화면, 상태 관리를 함께 만들어줘.”
Codex	코드 리뷰, 테스트 작성, 버그 수정, 타입 안정성 개선	“이 함수에서 발생 가능한 edge case를 찾고 테스트 코드를 작성해줘.”
Gemini CLI	전체 코드베이스 요약, 의존성 확인, 문서화, 대안 설계 검토	“현재 프로젝트 구조에서 인증, AI 호출, DB 접근이 잘 분리되어 있는지 검토해줘.”

8. 주요 DB 테이블 초안
테이블	주요 필드	역할
users	id, nickname, email, created_at, onboarding_completed	개별 사용자 정보
couples	id, invite_code, created_at, status	커플 연결 단위
couple_members	couple_id, user_id, role, joined_at	커플과 사용자 매핑
user_preferences	user_id, preferences_json, avoid_json, updated_at	온보딩 및 취향 데이터
date_cards	id, couple_id, creator_id, title, summary, tags, estimated_time, estimated_budget, status	데이트 후보 카드
reactions	id, card_id, user_id, reaction_type, condition_text, created_at	상대 반응 데이터
soft_messages	id, couple_id, user_id, input_json, generated_text, sent_status	내 마음 문장 생성 기록
date_memories	id, card_id, couple_id, review, want_again, photos, created_at	완료한 데이트 기록
push_tokens	user_id, token, platform, updated_at	푸시 알림 토큰

9. 핵심 이벤트 분석 지표
•	signup_completed
•	couple_connected
•	onboarding_completed
•	mode_selected
•	date_card_created
•	ai_card_created
•	reaction_added
•	mutual_candidate_created
•	soft_message_generated
•	date_completed
가장 중요한 초기 성공 지표는 “커플 연결 후 7일 안에 둘 다 반응한 데이트 후보가 3개 이상 생기는가”이다. 정성 지표로는 “사용자가 데이트 계획 부담이 줄었다고 느끼는가”를 반드시 확인한다.
10. 위험 요소와 대응
위험	대응
기능 범위가 커짐	1차 배포에서는 지도/SNS/결제 제외
AI 추천 품질이 낮음	템플릿 fallback + 프롬프트 개선
LLM 비용 증가	캐싱, 호출 제한, mini 모델 중심
커플 중 한 명만 씀	상대 반응 알림과 초대 흐름 강화
앱이 업무툴처럼 느껴짐	문구와 UI를 감성적으로 유지
장소 추천 부정확	초기에는 장소보다 코스/방향 추천
개발 지연	매주 기능 하나씩 완성 기준으로 진행

11. 스토어 배포 준비 체크리스트
•	앱 이름 및 아이콘
•	스플래시 이미지
•	스토어 스크린샷
•	앱 설명 및 키워드
•	개인정보처리방침 URL
•	이용약관 URL
•	지원 이메일
•	테스트 계정
•	앱 카테고리 및 연령 등급
•	데이터 수집 항목 고지
스토어 문구 초안
첫 문장: 데이트 계획, 혼자 다 하지 않아도 돼요.
짧은 설명: 커플이 서로의 취향과 오늘의 상태를 모아, 부담 없이 다음 데이트를 정할 수 있게 도와주는 앱입니다.
12. 바로 시작할 작업 순서
12.	앱 이름 임시 확정
13.	React Native Expo 프로젝트 생성
14.	Supabase 프로젝트 생성
15.	users / couples / date_cards / reactions 테이블 설계
16.	로그인 구현
17.	커플 초대 코드 구현
18.	데이트 모드 화면 구현
19.	AI 없이 템플릿 카드 생성
20.	LLM 연동
21.	반응/후보 정리 구현
처음 2주 안의 목표는 명확하다. 로그인하고, 연인과 연결되고, 첫 데이트 카드 하나를 만들 수 있는 앱을 완성하는 것이다.
