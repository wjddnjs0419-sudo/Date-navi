import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 스크린샷 dev 모드: EXPO_PUBLIC_SCREENSHOT=1 로 빌드하면 실제 네트워크/인증 대신
// fixture 로 채운 목업 클라이언트를 쓴다. 이 분기는 플래그가 켜졌을 때만 목업 모듈을
// 로드하므로 평소/프로덕션 빌드 동작에는 영향이 없다.
const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOT === '1';

function createRealClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다. .env.example 을 참고해 .env 를 만들어주세요.',
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

function createScreenshotClient() {
  // 정적 import 를 피하려고 require 사용 — 플래그가 꺼진 빌드에는 목업/픽스처가 포함되지 않는다.
  const { createMockSupabase } = require('./screenshot/mock-supabase');
  const {
    SCREENSHOT_FIXTURES,
    SCREENSHOT_RPC_RESULTS,
    SCREENSHOT_FUNCTION_RESULTS,
    SCREENSHOT_USER_ID,
  } = require('./screenshot/fixtures');
  return createMockSupabase({
    fixtures: SCREENSHOT_FIXTURES,
    rpcResults: SCREENSHOT_RPC_RESULTS,
    functionResults: SCREENSHOT_FUNCTION_RESULTS,
    userId: SCREENSHOT_USER_ID,
  });
}

type SupabaseClientType = ReturnType<typeof createRealClient>;

export const supabase: SupabaseClientType = SCREENSHOT_MODE
  ? (createScreenshotClient() as SupabaseClientType)
  : createRealClient();
