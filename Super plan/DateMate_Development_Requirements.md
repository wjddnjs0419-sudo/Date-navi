DateMate 개발 요구사항 정의서
MVP 개발 범위 · 시스템/비기능/AI/보안 요구사항

핵심 원칙: LLM은 장소 검색기가 아니라 조건 해석, 카드 생성, 후보 재정렬, 문장화를 담당한다.

1. 시스템 개요
•	모바일 앱은 Flutter 또는 React Native 기반 크로스플랫폼으로 개발한다.
•	초기 백엔드는 Supabase + Edge Functions + 별도 AI FastAPI 서버 또는 FastAPI + PostgreSQL + Redis 구성을 사용한다.
•	AI 기능은 OpenAI gpt-5.4-mini를 기본으로 하며, 복잡한 추천은 상위 모델로 라우팅한다.
•	장소 추천은 MVP에서 외부 지도 링크로 처리하고, 2차 단계에서 네이버 지역 검색 API 및 Google Places API를 연동한다.
2. 권장 기술 스택
영역	권장 기술	비고
앱	Flutter 또는 React Native	MVP 속도와 iOS/Android 동시 대응
API 서버	FastAPI 또는 NestJS	AI 서버는 FastAPI 권장
DB	PostgreSQL	커플/카드/반응/취향 데이터 저장
캐시	Redis	추천 결과, 세션, rate limit
인증	Kakao/Apple/Google Login, Supabase/Firebase Auth	한국 시장 + iOS 심사 고려
푸시	Firebase Cloud Messaging	상대 반응, 후보 생성 알림
파일 저장	AWS S3 또는 Cloudflare R2	사진/추억 이미지 저장
모니터링	Sentry, Grafana/Datadog	앱 오류 및 API 장애 추적
AI	OpenAI + Claude A/B 테스트	감성 문장 기능 비교

3. API 요구사항
API	Method	설명	우선순위
/auth/social-login	POST	소셜 로그인 토큰 검증 및 사용자 생성/조회	필수
/couples/invite	POST	초대 코드/링크 생성	필수
/couples/join	POST	초대 코드로 커플 연결	필수
/onboarding/preferences	POST	기본 취향 저장	필수
/modes/start	POST	데이트 모드 세션 생성	필수
/ai/parse-feeling	POST	느낌 입력을 구조화된 조건으로 변환	필수
/ai/date-card	POST	조건 기반 데이트 카드 생성	필수
/cards	GET/POST	데이트 카드 조회/생성	필수
/cards/{id}/reactions	POST	카드에 반응 저장	필수
/ai/soft-message	POST	부드러운 문장 생성	필수
/cards/candidates	GET	둘 다 괜찮은 후보 리스트 조회	필수
/memories	POST	완료한 데이트 기록 저장	선택

4. AI 서버 요구사항
요구사항	내용
모델 라우팅	기본 작업은 gpt-5.4-mini, 복잡한 후보 재정렬은 gpt-5.4급 모델 사용
출력 형식	모든 AI 결과는 JSON Schema 검증 후 앱에 전달
프롬프트 관리	시스템 프롬프트, 모드별 프롬프트, 안전 문구를 버전 관리
캐싱	동일 조건 추천, 커플 취향 요약, 시스템 프롬프트 캐싱
오류 처리	AI 실패 시 템플릿 기반 기본 추천으로 fallback
문장 생성 안전	민감한 문장은 자동 전송 금지. 사용자 확인 후 전송

5. 개인정보/보안 요구사항
항목	요구사항
위치 정보	MVP에서는 정확한 실시간 위치보다 지역 단위 입력을 기본값으로 한다.
커플 데이터	커플 연결 해제 시 데이터 삭제 또는 분리 옵션 제공
대화/문장	내 마음 문장 생성 원문은 장기 보관하지 않고, 추천용 요약만 저장하는 방향 권장
권한	사용자는 상대 데이터 중 공유된 카드/반응만 볼 수 있다. 개인 설정은 비공개
로그	AI 요청 로그에 민감 정보가 남지 않도록 마스킹 처리
전송	모든 API 통신 HTTPS, 토큰 기반 인증 적용

6. 비기능 요구사항
구분	요구사항
응답속도	일반 API 500ms~1s 목표, AI 카드 생성 3~8초 이내 목표
가용성	MVP 베타 기준 99% 수준 목표. AI 장애 시 fallback 제공
확장성	AI 서버는 앱 API와 분리하여 독립 확장 가능하게 설계
관측성	AI 호출 성공률, 지연시간, 비용, 오류율을 별도 로깅
품질관리	AI 응답 JSON 검증 실패 시 재시도 또는 템플릿 응답 반환
비용관리	무료 유저 AI 호출 횟수 제한, 캐싱, 모델 라우팅 필수

7. 데이터베이스 테이블 초안
테이블	주요 컬럼	설명
users	id, nickname, email, auth_provider, created_at	사용자 계정
couples	id, user_a_id, user_b_id, invite_code, status	커플 연결
preferences	id, user_id, preferred_tags, avoid_tags, budget_level, distance_level	기본 취향
mode_sessions	id, couple_id, created_by, mode, input_json, parsed_json	모드 세션
date_cards	id, couple_id, created_by, source, title, summary, tags, status	데이트 후보 카드
reactions	id, card_id, user_id, reaction_type, comment, created_at	반응
soft_messages	id, user_id, card_id, reason_json, output_text, used	문장 생성 결과
memories	id, couple_id, card_id, rating, note, photo_url	완료 데이트 기록
ai_logs	id, user_id, task_type, model, token_usage, latency_ms, status	AI 비용/품질 추적

8. 개발 마일스톤
주차	목표	산출물
1주차	기획 확정 및 IA/와이어프레임 정리	기능명세, 화면 흐름, 데이터 모델
2~3주차	인증/커플 연결/온보딩 구현	로그인, 초대, 기본 취향 저장
4~5주차	데이트 모드/카드/반응 구현	모드 입력, 카드 CRUD, 반응 저장
6주차	AI 서버 연동	조건 해석, 카드 생성, 문장 생성
7주차	후보 정리/푸시/추억 기능	상대 알림, 후보 분류, 완료 기록
8주차	QA 및 베타 테스트	내부 테스트, AI 품질 점검, 오류 수정

9. 주요 리스크와 대응
리스크	대응
AI 추천 품질이 낮음	처음에는 실제 장소보다 데이트 방향/코스 추천에 집중하고, 템플릿 fallback 준비
LLM 비용 증가	모델 라우팅, 캐싱, 호출 제한, 결과 재사용 적용
사용자가 수동적으로 남음	빈칸 입력보다 선택지/버튼 중심 UX 제공
민감한 문장으로 갈등 유발	자동 전송 금지, 사용자가 수정/확인 후 전송
장소 데이터 부정확	MVP에서는 외부 지도 연결, 2차에서 공식 지도 API 연동
업무툴처럼 보임	투표/제출/분석 같은 표현을 피하고 감성적 문구 사용

