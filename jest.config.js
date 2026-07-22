module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // .claude/worktrees/*는 별도 git worktree(자체 node_modules)라 여기서 재귀 탐색하면
  // 워크트리 내부 테스트가 중복 실행되며 모듈 해석이 깨진다 — 반드시 제외.
  // testPathIgnorePatterns만으로는 haste-map의 __mocks__ 수동 mock 스캔까지 막지 못해
  // "duplicate manual mock" 경고 + 간헐적 오해석이 생긴다 — modulePathIgnorePatterns도 필요.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
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
    '^(\\.\\.?/)*lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    '^\\./supabase$': '<rootDir>/__mocks__/supabase.js',
  },
};
