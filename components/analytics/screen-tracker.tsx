import { useEffect, useRef } from 'react';
import { useSegments } from 'expo-router';
import { logScreenView } from '../../lib/analytics';
import { resolveScreenName, type ScreenName } from '../../lib/analytics-screen';

export function AnalyticsScreenTracker() {
  const segments = useSegments();
  const previousScreenName = useRef<ScreenName | null>(null);
  const screenName = resolveScreenName(segments);

  useEffect(() => {
    if (!screenName || previousScreenName.current === screenName) return;
    previousScreenName.current = screenName;
    void logScreenView(screenName);
  }, [screenName]);

  return null;
}
