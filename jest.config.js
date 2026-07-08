module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  moduleNameMapper: {
    '@react-native-async-storage/async-storage': require.resolve(
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    ),
    'react-native-url-polyfill/auto': '<rootDir>/__mocks__/react-native-url-polyfill-auto.js',
    'expo-notifications': '<rootDir>/__mocks__/expo-notifications.js',
    'expo-constants': '<rootDir>/__mocks__/expo-constants.js',
    '^\\.*/lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    '^\\./supabase$': '<rootDir>/__mocks__/supabase.js',
  },
};
