#!/usr/bin/env bash
# HTTP 제어 서버(scripts/shot-control-server.py)를 통해 실행 중인 시뮬레이터 앱의
# ScreenshotNavigator 를 구동해 모든 화면/모달을 순회 캡처한다. openurl/탭 불필요.
# 전제:
#   1) EXPO_PUBLIC_SCREENSHOT=1 로 빌드·실행된 앱이 부팅된 시뮬레이터에서 동작 중
#   2) python3 scripts/shot-control-server.py 8099 가 백그라운드로 떠 있음
# 사용: bash scripts/screenshot-all.sh <출력디렉터리>
set -euo pipefail

OUT="${1:?출력 디렉터리를 인자로 주세요}"
CTRL="http://127.0.0.1:8099"
WAIT="${WAIT:-2.2}"
mkdir -p "$OUT"

ROUTES=(
  "01-home|/(tabs)"
  "03-candidates|/(tabs)/candidates"
  "04-memories|/(tabs)/memories"
  "05-settings|/settings"
  "06-plans|/plans"
  "07-legal-terms|/legal/terms"
  "08-legal-privacy|/legal/privacy"
  "10-onboarding-nickname|/onboarding/nickname"
  "11-onboarding-photo|/onboarding/photo"
  "12-onboarding-anniversary|/onboarding/anniversary"
  "13-onboarding-type|/onboarding/type"
  "14-onboarding-couple-choice|/onboarding/couple-choice"
  "15-onboarding-couple-connect|/onboarding/couple-connect"
  "16-onboarding-connected|/onboarding/connected"
  "17-onboarding-preferences|/onboarding/preferences"
  "20-modeflow-course|/mode-flow/course"
  "23-modeflow-generating|/shot?m=generating"
  "25-modeflow-course-result|/mode-flow/course-result?requestId=req-phase8-001&sessionId=req-phase8-001"
  "26-modeflow-place-search|/mode-flow/place-search"
  "27-modeflow-place-detail|/mode-flow/place-detail?name=어니언 성수&address=서울 성동구 왕십리로 2&kakaoPlaceId=place-cafe&mapUrl=https://place.map.kakao.com/place-cafe"
  "30-card-detail|/card/card-1"
  "31-card-confirm|/card/confirm"
  "32-card-review|/card/review"
  "33-card-edit|/card/edit/card-1"
  "34-card-memory-new|/card/memory/new"
  "35-card-memory-detail|/card/memory/memory-1"
  "36-card-memory-edit|/card/memory/edit/memory-1"
  "40-share-send|/share/send"
  "41-share-reaction|/share/reaction"
  "42-share-mutual|/share/mutual"
  "50-account-notifications|/account/notifications"
  "51-account-edit-profile|/account/edit-profile"
  "52-account-delete|/account/delete-account"
  "60-modal-success|/shot?m=success"
  "61-modal-picker|/shot?m=picker"
  "62-modal-stepaction|/shot?m=stepaction"
)

urlencode() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

echo "캡처 시작 → $OUT (라우트 ${#ROUTES[@]}개, 대기 ${WAIT}s)"
for entry in "${ROUTES[@]}"; do
  name="${entry%%|*}"
  path="${entry#*|}"
  curl -s "$CTRL/set?p=$(urlencode "$path")" >/dev/null || echo "  set 실패: $path"
  sleep "$WAIT"
  xcrun simctl io booted screenshot "$OUT/${name}.png" >/dev/null 2>&1 && echo "  ✓ ${name}" || echo "  ✗ ${name}"
done
curl -s "$CTRL/set?p=IDLE" >/dev/null || true
echo "완료. $(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ') 장."
