module.exports = {
  supabase: {
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      upsert: jest.fn(),
      maybeSingle: jest.fn(),
    })),
  },
};
