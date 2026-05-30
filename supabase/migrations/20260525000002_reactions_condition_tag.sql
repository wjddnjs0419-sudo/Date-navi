-- reactions 테이블에 condition_tag 컬럼 추가
-- "오늘은 부담돼" 반응 시 세부 조건 저장용
ALTER TABLE reactions
  ADD COLUMN IF NOT EXISTS condition_tag text
  CHECK (condition_tag IS NULL OR condition_tag IN (
    'change_place',   -- 장소만 바꾸면
    'closer',         -- 가까우면
    'indoor',         -- 실내면
    'budget_adjust'   -- 예산 조정되면
  ));
