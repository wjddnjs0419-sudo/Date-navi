jest.mock('@react-native-firebase/analytics');

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import { getAnalytics, logEvent as firebaseLogEvent } from '@react-native-firebase/analytics';
import { logEvent } from '../lib/analytics';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockFirebaseGetAnalytics = getAnalytics as jest.Mock;
const mockFirebaseLogEvent = firebaseLogEvent as jest.Mock;

describe('GA4 event forwarding', () => {
  beforeEach(() => {
    mockFirebaseLogEvent.mockReset();
    mockFirebaseGetAnalytics.mockClear();
    mockFirebaseLogEvent.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockFrom.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) });
  });

  it('maps the reserved login event name before forwarding it to Firebase Analytics', async () => {
    await logEvent('login', { method: 'apple' });

    expect(mockFirebaseGetAnalytics).toHaveBeenCalled();
    expect(mockFirebaseLogEvent).toHaveBeenCalledWith('firebase-analytics', 'user_login', { method: 'apple' });
  });

  it('still records the event in Supabase when Firebase Analytics fails', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });
    mockFirebaseLogEvent.mockImplementation(() => { throw new Error('Firebase unavailable'); });

    await logEvent('couple_connected');

    expect(insert).toHaveBeenCalledWith({
      event_name: 'couple_connected',
      user_id: 'user-123',
      params: {},
    });
  });
});
