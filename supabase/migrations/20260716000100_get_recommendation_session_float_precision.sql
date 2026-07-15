-- get_recommendation_session이 recommendation_course_steps(double precision 컬럼)를
-- to_jsonb로 직렬화할 때 이 프로젝트의 extra_float_digits=0 설정 때문에 유효자리 15자리로
-- 반올림됐다. current_course(jsonb 원본, numeric 기반이라 정밀도 그대로 유지)와
-- 좌표값이 달라져 클라이언트의 row-vs-course 무결성 검증(mapRecommendationSessionPayload)이
-- 임의의 코스에서 간헐적으로 'malformed'를 던지는 원인이었다.
-- extra_float_digits=3(round-trip 보장 상한)을 함수 단위로 올려 해결한다.

alter function public.get_recommendation_session(text) set extra_float_digits = 3;
