import { useCallback, useRef, useState } from 'react';

/**
 * Stale-while-revalidate 로딩 게이트.
 *
 * 최초 로드에만 전체 스피너(`loading=true`)를 띄우고, 이후 재포커스 재조회는
 * 기존 화면을 유지한 채 조용히 갱신한다. 탭 전환마다 스피너가 깜빡이는 UX를 없앤다.
 *
 * - `begin()`: 재조회 시작. 최초 로드일 때만 `loading`을 true로 만든다.
 * - `end()`: 재조회 종료. 항상 `loading=false`로 내리고 최초 로드 완료를 기록한다.
 */
export function useRevalidatingLoad(): {
  loading: boolean;
  begin: () => void;
  end: () => void;
} {
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const begin = useCallback(() => {
    if (!hasLoadedRef.current) setLoading(true);
  }, []);

  const end = useCallback(() => {
    hasLoadedRef.current = true;
    setLoading(false);
  }, []);

  return { loading, begin, end };
}
