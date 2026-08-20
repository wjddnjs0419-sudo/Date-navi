jest.mock('@react-native-firebase/analytics');

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import {
  getAnalytics,
  logEvent as firebaseLogEvent,
  logScreenView as firebaseLogScreenView,
} from '@react-native-firebase/analytics';
import { logEvent, logScreenView, type AnalyticsEventName } from '../lib/analytics';

const supportedEventNames: readonly AnalyticsEventName[] = [
  'login',
  'couple_connected',
  'onboarding_completed',
  'recommendation_request_started',
  'recommendation_request_succeeded',
  'recommendation_request_failed',
  'place_selected',
  'course_regenerate_requested',
  'course_saved',
  'proposal_sent',
];

// @ts-expect-error Legacy analytics aliases must not re-enter the transport union.
const removedLegacyEventName: AnalyticsEventName = 'ai_card_created';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockFirebaseGetAnalytics = getAnalytics as jest.Mock;
const mockFirebaseLogEvent = firebaseLogEvent as jest.Mock;
const mockFirebaseLogScreenView = firebaseLogScreenView as jest.Mock;

describe('GA4 event forwarding', () => {
  let mockConsoleWarn: jest.SpyInstance;

  beforeEach(() => {
    mockFirebaseLogEvent.mockReset();
    mockFirebaseLogScreenView.mockReset();
    mockFirebaseGetAnalytics.mockClear();
    mockFirebaseLogEvent.mockResolvedValue(undefined);
    mockFirebaseLogScreenView.mockResolvedValue(undefined);
    mockFrom.mockClear();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-123' } } } });
    mockFrom.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) });
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => mockConsoleWarn.mockRestore());

  it('keeps the public event union limited to retained and approved events', () => {
    expect(supportedEventNames).toHaveLength(10);
    expect(removedLegacyEventName).toBe('ai_card_created');
  });

  it('forwards the canonical login event name to Firebase and Supabase', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    await logEvent('login', { method: 'apple' });

    expect(mockFirebaseGetAnalytics).toHaveBeenCalled();
    expect(mockFirebaseLogEvent).toHaveBeenCalledWith('firebase-analytics', 'login', { method: 'apple' });
    expect(insert).toHaveBeenCalledWith({
      event_name: 'login',
      params: { method: 'apple' },
    });
  });

  it('records an authenticated screen view with the same Supabase payload', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    await logScreenView('home');

    expect(mockFirebaseLogScreenView).toHaveBeenCalledWith('firebase-analytics', {
      screen_name: 'home',
      screen_class: 'DateNavi',
    });
    expect(insert).toHaveBeenCalledWith({
      event_name: 'screen_view',
      params: { screen_name: 'home', screen_class: 'DateNavi' },
    });
  });

  it('sends anonymous events only to Firebase', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await logScreenView('home');

    expect(mockFirebaseLogScreenView).toHaveBeenCalledWith('firebase-analytics', {
      screen_name: 'home',
      screen_class: 'DateNavi',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not mirror Supabase anonymous-auth sessions', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'anon-123', is_anonymous: true } } } });

    await logScreenView('home');

    expect(mockFirebaseLogScreenView).toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('still records an authenticated event in Supabase when Firebase fails', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });
    mockFirebaseLogEvent.mockImplementation(() => { throw new Error('Firebase unavailable'); });

    await logEvent('couple_connected');

    expect(insert).toHaveBeenCalledWith({ event_name: 'couple_connected', params: {} });
  });
});
