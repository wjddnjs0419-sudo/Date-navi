import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'ko' | 'en';

const STORAGE_KEY = 'datemate.language';

type ModeItem = {
  id: string;
  emoji: string;
  label: string;
  desc: string;
};

type FeelingStep = {
  key: 'energy' | 'budget' | 'distance' | 'mood' | 'duration';
  question: string;
  options: { label: string; emoji: string; value: string }[];
};

type Copy = {
  language: { ko: string; en: string };
  common: {
    back: string;
    next: string;
    done: string;
    save: string;
    skip: string;
    loading: string;
    retry: string;
  };
  tabs: {
    home: string;
    mode: string;
    candidates: string;
    softMessage: string;
    memories: string;
  };
  settings: {
    title: string;
    subtitle: string;
    languageTitle: string;
    languageSubtitle: string;
    currentLanguage: string;
    korean: string;
    english: string;
    accountTitle: string;
    logout: string;
    nicknameTitle: string;
    nicknamePlaceholder: string;
    nicknameSave: string;
    nicknameSaving: string;
    nicknameSuccess: string;
    nicknameEmpty: string;
    nicknameError: string;
    passwordTitle: string;
    passwordPlaceholder: string;
    passwordSave: string;
    passwordSaving: string;
    passwordSuccess: string;
    passwordShort: string;
    passwordError: string;
    deleteTitle: string;
    deleteWarning: string;
    deleteButton: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    deleteConfirmPlaceholder: string;
    deleteConfirmKeyword: string;
    deleteConfirmAction: string;
    deleteCancel: string;
    deleteError: string;
    deleteDeleting: string;
    nameEmpty: string;
    partnerFallback: string;
    daysWith: (partner: string, days: number) => string;
    statDates: string;
    statWantAgain: string;
    rowNickname: string;
    rowCouple: string;
    rowPassword: string;
    prefsTitle: string;
    rowNotifications: string;
    rowLanguage: string;
    infoTitle: string;
    rowHelp: string;
    rowTerms: string;
    rowPrivacy: string;
    langPickTitle: string;
    langPickMessage: string;
    cancel: string;
    helpTitle: string;
    helpMessage: string;
  };
  auth: {
    appName: string;
    subtitle: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    signIn: string;
    signingIn: string;
    signUp: string;
    toSignUp: string;
    toSignIn: string;
    terms: string;
    privacy: string;
    languageHint: string;
    errorEmail: string;
    errorPassword: string;
    errorGeneric: string;
    errorInvalidLogin: string;
    errorRegistered: string;
    errorNeedConfirmation: string;
    errorInvalidEmail: string;
    errorRateLimit: string;
    errorNetwork: string;
  };
  home: {
    greeting: (name?: string) => string;
    ask: string;
    connected: (partnerName: string) => string;
    connect: string;
    startMode: string;
    logout: string;
  };
  nickname: {
    title: string;
    subtitle: string;
    placeholder: string;
    next: string;
    saving: string;
    alertEmpty: string;
    alertNoUser: string;
    alertError: string;
  };
  coupleConnect: {
    title: string;
    subtitle: string;
    createTitle: string;
    createDesc: string;
    share: string;
    wait: string;
    createButton: string;
    inputTitle: string;
    inputDesc: string;
    codePlaceholder: string;
    connectButton: string;
    alertNoUser: string;
    alertDuplicateTitle: string;
    alertDuplicateDesc: string;
    alertNetwork: string;
    alertCreateError: string;
    alertCodeEmpty: string;
    alertCodeNotFoundTitle: string;
    alertCodeNotFoundDesc: string;
    alertOwnCodeTitle: string;
    alertOwnCodeDesc: string;
    alertJoinNetwork: string;
    alertJoinError: string;
    shareMessage: (code: string) => string;
  };
  preferences: {
    stepTitles: string[];
    stepSubs: string[];
    preferredOptions: string[];
    avoidOptions: string[];
    longDistanceOptions: { value: boolean; label: string }[];
    planningStyles: string[];
    skip: string;
    next: string;
    done: string;
    back: string;
    saving: string;
    alertSaveError: string;
  };
  mode: {
    title: string;
    modes: ModeItem[];
  };
  feeling: {
    modeTitles: Record<string, string>;
    steps: FeelingStep[];
    finalStep: string;
    avoidQuestion: string;
    avoidOptions: { label: string; value: string }[];
    additionalLabel: string;
    additionalPlaceholder: string;
    generateButton: string;
    back: string;
  };
  course: {
    modeLabel: string;
    title: string;
    ideaLabel: string;
    ideaPlaceholder: string;
    ideaHint: string;
    budgetLabel: string;
    budgetOptions: { label: string; emoji: string; value: string }[];
    durationLabel: string;
    durationOptions: { label: string; emoji: string; value: string }[];
    generateButton: string;
    back: string;
    errorEmpty: string;
  };
  result: {
    title: string;
    loadingTitle: string;
    loadingSubtitle: string;
    errorTitle: string;
    errorSubtitle: string;
    retryButton: string;
    backToMode: string;
    saveButton: string;
    saved: string;
    goToFirst: string;
    goToCandidates: string;
    cardTitle: string;
    saveNetworkError: string;
    saveLoginError: string;
    saveCoupleError: string;
    saveGeneralError: string;
  };
  candidates: {
    title: string;
    tabs: { key: 'all' | 'both' | 'conditional' | 'next'; label: string }[];
    modeLabels: Record<string, string>;
    reactionLabels: Record<'love' | 'like' | 'burden' | 'next_time', { emoji: string; label: string }>;
    emptyTitle: string;
    emptySubtitle: string;
    emptyTabSubtitle: string;
    goMode: string;
    loading: string;
    error: string;
    tapHint: string;
  };
  softMessage: {
    title: string;
    subtitle: string;
    stepTitle: string;
    stepSubtitle: string;
    reasons: { key: string; label: string; emoji: string }[];
    additionalLabel: string;
    additionalPlaceholder: string;
    createButton: string;
    resultTitle: string;
    resultSubtitle: string;
    messageLabel: string;
    autoSendNotice: string;
    copyButton: string;
    copiedButton: string;
    saveButton: string;
    resetButton: string;
    errorNeedReason: string;
    errorCoupleRequired: string;
    errorSave: string;
  };
  memories: {
    title: string;
    subtitle: string;
    loading: string;
    emptyTitle: string;
    emptySubtitle: string;
    wantAgainYes: string;
    wantAgainNo: string;
    modeLabels: Record<string, string>;
  };
  card: {
    title: string;
    loading: string;
    missing: string;
    reactionTitle: string;
    reactionSubtitle: string;
    partnerWaiting: string;
    partnerReaction: (label: string, emoji: string) => string;
    memoryButton: string;
    memoryDone: string;
    saveError: string;
    confirmButton: string;
    reactionLabels: Record<'love' | 'like' | 'burden' | 'next_time', { emoji: string; label: string }>;
    modeLabels: Record<string, string>;
  };
  confirm: {
    heading: string;
    sub: string;
    dateLabel: string;
    timeLabel: string;
    placeLabel: string;
    itemsLabel: string;
    datePlaceholder: string;
    timePlaceholder: string;
    placePlaceholder: string;
    itemsPlaceholder: string;
    saveButton: string;
    keepButton: string;
    saveError: string;
  };
  review: {
    heading: string;
    sub: string;
    ratingLabel: string;
    ratings: { key: string; label: string }[];
    reviewLabel: string;
    reviewPlaceholder: string;
    saveButton: string;
    noRatingError: string;
    saveError: string;
    missingCoupleError: string;
  };
  notifications: {
    title: string;
    unreadSuffix: string;
    allRead: string;
    clearAll: string;
    emptyTitle: string;
    emptyBody: string;
    groupToday: string;
    groupWeek: string;
    groupEarlier: string;
    reactionTitle: string;
    newCardTitle: string;
    softMessageTitle: string;
    timeJustNow: string;
    timeMinutes: string;
    timeHours: string;
    timeYesterday: string;
    timeDays: string;
    modalCopyButton: string;
    modalCloseButton: string;
  };
};

const COPY: Record<AppLanguage, Copy> = {
  ko: {
    language: { ko: '한국어', en: 'English' },
    common: {
      back: '←',
      next: '다음',
      done: '완료',
      save: '저장하기',
      skip: '건너뛰기',
      loading: '불러오는 중입니다.',
      retry: '다시 시도하기',
    },
    tabs: {
      home: '홈',
      mode: '데이트 모드',
      candidates: '우리 후보',
      softMessage: '마음 전하기',
      memories: '추억',
    },
    settings: {
      title: '마이페이지',
      subtitle: '닉네임, 비밀번호, 언어 설정을 관리해요.',
      languageTitle: '앱 언어',
      languageSubtitle: 'DateMate에서 사용할 언어를 선택하세요.',
      currentLanguage: '현재 언어',
      korean: '한국어',
      english: 'English',
      accountTitle: '계정',
      logout: '로그아웃',
      nicknameTitle: '닉네임 수정',
      nicknamePlaceholder: '닉네임',
      nicknameSave: '변경하기',
      nicknameSaving: '저장 중...',
      nicknameSuccess: '닉네임이 변경됐어요.',
      nicknameEmpty: '닉네임을 입력해주세요.',
      nicknameError: '닉네임 변경에 실패했어요.',
      passwordTitle: '비밀번호 변경',
      passwordPlaceholder: '새 비밀번호 (6자 이상)',
      passwordSave: '변경하기',
      passwordSaving: '변경 중...',
      passwordSuccess: '비밀번호가 변경됐어요.',
      passwordShort: '비밀번호는 6자 이상이어야 해요.',
      passwordError: '비밀번호 변경에 실패했어요.',
      deleteTitle: '회원 탈퇴',
      deleteWarning: '탈퇴하면 프로필, 취향 데이터, 마음 전하기 기록이 영구 삭제돼요. 공유된 데이트 후보와 반응은 상대방이 계속 볼 수 있어요.',
      deleteButton: '탈퇴하기',
      deleteConfirmTitle: '정말 탈퇴할까요?',
      deleteConfirmMessage: '확인을 위해 아래에 "탈퇴"를 입력해주세요.',
      deleteConfirmPlaceholder: '탈퇴',
      deleteConfirmKeyword: '탈퇴',
      deleteConfirmAction: '탈퇴 확인',
      deleteCancel: '취소',
      deleteError: '탈퇴 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
      deleteDeleting: '탈퇴 처리 중...',
      nameEmpty: '닉네임 없음',
      partnerFallback: '상대방',
      daysWith: (partner: string, days: number) => `${partner}과 ${days}일째`,
      statDates: '함께한 데이트',
      statWantAgain: '다시 하고싶어',
      rowNickname: '닉네임',
      rowCouple: '커플 연결',
      rowPassword: '비밀번호 변경',
      prefsTitle: '환경설정',
      rowNotifications: '알림',
      rowLanguage: '언어',
      infoTitle: '정보',
      rowHelp: '도움말',
      rowTerms: '이용약관',
      rowPrivacy: '개인정보처리방침',
      langPickTitle: '언어 선택',
      langPickMessage: '앱 언어를 선택해주세요.',
      cancel: '취소',
      helpTitle: '도움말',
      helpMessage: '궁금한 점이 있으시면 jake051096@gmail.com으로 문의해주세요.',
    },
    auth: {
      appName: 'DateMate 💕',
      subtitle: '데이트 계획, 혼자 다 하지 않아도 돼요.',
      emailPlaceholder: '이메일',
      passwordPlaceholder: '비밀번호 (6자 이상)',
      signIn: '로그인',
      signingIn: '처리 중...',
      signUp: '가입하기',
      toSignUp: '계정이 없어요 → 가입하기',
      toSignIn: '이미 계정이 있어요 → 로그인',
      terms: '이용약관',
      privacy: '개인정보처리방침',
      languageHint: '언어',
      errorEmail: '이메일을 입력해주세요.',
      errorPassword: '비밀번호는 6자 이상이어야 해요.',
      errorGeneric: '오류가 발생했어요. 다시 시도해주세요.',
      errorInvalidLogin: '이메일 또는 비밀번호가 올바르지 않아요.',
      errorRegistered: '이미 가입된 이메일이에요.',
      errorNeedConfirmation: '이메일 인증이 필요해요.',
      errorInvalidEmail: '이메일 형식이 올바르지 않아요.',
      errorRateLimit: '잠시 후 다시 시도해주세요.',
      errorNetwork: '네트워크 연결을 확인해주세요.',
    },
    home: {
      greeting: (name?: string) => (name ? `${name}님,` : '안녕하세요,'),
      ask: '오늘은 어떻게 도와드릴까요?',
      connected: (partnerName: string) => `💑 ${partnerName}님과 연결됨`,
      connect: '💌 연인과 연결하기',
      startMode: '데이트 모드 시작하기',
      logout: '로그아웃',
    },
    nickname: {
      title: '어떻게 불러드릴까요?',
      subtitle: '연인에게 보일 닉네임을 입력해주세요.',
      placeholder: '닉네임',
      next: '다음',
      saving: '저장 중...',
      alertEmpty: '닉네임을 입력해주세요.',
      alertNoUser: '로그인 정보를 찾을 수 없어요.',
      alertError: '오류가 발생했어요.',
    },
    coupleConnect: {
      title: '연인과 연결해요',
      subtitle: '코드를 만들어 공유하거나\n받은 코드를 입력하세요.',
      createTitle: '코드 만들기',
      createDesc: '내 코드를 연인에게 공유하세요.',
      share: '공유하기',
      wait: '연인이 연결할 때까지 기다릴게요 →',
      createButton: '코드 생성',
      inputTitle: '코드 입력하기',
      inputDesc: '연인에게 받은 코드를 입력하세요.',
      codePlaceholder: '코드 6자리',
      connectButton: '연결하기',
      alertNoUser: '로그인 정보를 찾을 수 없어요.',
      alertDuplicateTitle: '이미 코드가 있어요',
      alertDuplicateDesc: '이전에 만든 코드를 사용하거나, 연인의 코드를 입력해주세요.',
      alertNetwork: '네트워크 연결을 확인해주세요.',
      alertCreateError: '코드 생성 중 문제가 발생했어요. 다시 시도해주세요.',
      alertCodeEmpty: '코드를 입력해주세요.',
      alertCodeNotFoundTitle: '코드를 찾을 수 없어요',
      alertCodeNotFoundDesc: '코드를 다시 확인해주세요.\n대문자로 정확히 입력했는지 확인해주세요.',
      alertOwnCodeTitle: '내가 만든 코드예요',
      alertOwnCodeDesc: '이 코드를 연인에게 공유하고, 연인이 입력하게 해주세요.',
      alertJoinNetwork: '네트워크 연결을 확인해주세요.',
      alertJoinError: '연결 중 문제가 발생했어요. 다시 시도해주세요.',
      shareMessage: (code: string) => `DateMate 커플 연결 코드: ${code}`,
    },
    preferences: {
      stepTitles: ['어떤 데이트가 끌려요?', '피하고 싶은 게 있나요?', '장거리 커플인가요?', '데이트 계획할 때 나는?'],
      stepSubs: ['여러 개 골라도 괜찮아요', '솔직하게 골라주세요', '떨어져 사는 커플이에요', '현재 상태에 가까운 걸 골라주세요'],
      preferredOptions: ['맛집', '카페', '산책', '집데이트', '전시/문화생활', '액티비티'],
      avoidOptions: ['먼 이동', '큰 지출', '사람 많은 곳', '오래 걷기', '예약 복잡한 곳'],
      longDistanceOptions: [
        { value: true, label: '네, 장거리 커플이에요' },
        { value: false, label: '아니요, 같은 지역이에요' },
      ],
      planningStyles: ['자주 계획하는 편', '같이 정하는 편', '고르는 건 OK, 계획은 어려움', '의견 표현이 어려운 편', '그때그때 달라요'],
      skip: '건너뛰기',
      next: '다음',
      done: '완료',
      back: '←',
      saving: '저장 중...',
      alertSaveError: '저장에 실패했어요. 다시 시도해주세요.',
    },
    mode: {
      title: '오늘은 어떻게\n도와드릴까요?',
      modes: [
        { id: 'pick_for_me', emoji: '🎲', label: '앱이 골라줘', desc: '조건만 알려주면 후보 3개를 골라드릴게요' },
        { id: 'feeling_only', emoji: '🌸', label: '느낌만 말할게', desc: '끌리는 분위기만 골라도 충분해요' },
        { id: 'make_course', emoji: '🗺️', label: '코스로 정리해줘', desc: '아이디어가 있다면 코스로 만들어드릴게요' },
        { id: 'soft_message', emoji: '💬', label: '부드럽게 말해줘', desc: '말하기 어려운 마음을 부드럽게 전해드릴게요' },
        { id: 'light_date', emoji: '🧸', label: '가볍게 하고 싶어', desc: '피곤한 날, 부담 없이 할 수 있는 데이트' },
        { id: 'special_date', emoji: '🌟', label: '특별하게 하고 싶어', desc: '기념일이나 특별한 날을 위한 코스' },
        { id: 'next_time', emoji: '📅', label: '다음에 만나면', desc: '다음 만남을 함께 준비해두세요' },
        { id: 'low_risk', emoji: '🛡️', label: '실패 확률 낮게', desc: '무난하고 만족도 높은 데이트를 골라드릴게요' },
      ],
    },
    feeling: {
      modeTitles: {
        pick_for_me: '앱이 골라줄게요',
        feeling_only: '느낌만 알려줘요',
        light_date: '가볍게 해봐요',
        low_risk: '실패 없는 데이트',
        special_date: '특별한 데이트',
        next_time: '다음 만남 준비',
        make_course: '코스로 정리해줘',
        soft_message: '마음 전하기',
      },
      steps: [
        {
          key: 'energy',
          question: '오늘 컨디션은\n어때?',
          options: [
            { label: '피곤해', emoji: '😴', value: 'low' },
            { label: '보통이야', emoji: '😊', value: 'medium' },
            { label: '에너지 넘쳐', emoji: '🎉', value: 'high' },
          ],
        },
        {
          key: 'budget',
          question: '예산은 어느 정도\n생각하고 있어?',
          options: [
            { label: '아끼고 싶어', emoji: '💰', value: 'low' },
            { label: '적당히', emoji: '💳', value: 'medium' },
            { label: '특별하게', emoji: '✨', value: 'high' },
          ],
        },
        {
          key: 'distance',
          question: '얼마나 멀리\n가도 돼?',
          options: [
            { label: '가까운 곳', emoji: '🏠', value: 'near' },
            { label: '상관없어', emoji: '🚗', value: 'any' },
            { label: '멀리도 가능', emoji: '🚂', value: 'far' },
          ],
        },
        {
          key: 'mood',
          question: '어떤 분위기가\n끌려?',
          options: [
            { label: '편하게', emoji: '🛋️', value: 'comfortable' },
            { label: '재밌게', emoji: '🎡', value: 'fun' },
            { label: '로맨틱하게', emoji: '🌹', value: 'romantic' },
          ],
        },
        {
          key: 'duration',
          question: '얼마나 시간\n낼 수 있어?',
          options: [
            { label: '1시간', emoji: '⏰', value: '1h' },
            { label: '2~3시간', emoji: '⏱️', value: '2-3h' },
            { label: '반나절', emoji: '🌤️', value: 'half_day' },
            { label: '하루종일', emoji: '☀️', value: 'full_day' },
          ],
        },
      ],
      finalStep: '마지막 단계',
      avoidQuestion: '피하고 싶은 게\n있어? (선택)',
      avoidOptions: [
        { label: '오래 걷기', value: 'long_walk' },
        { label: '사람 많은 곳', value: 'crowded' },
        { label: '야외 활동', value: 'outdoor' },
        { label: '비싼 곳', value: 'expensive' },
        { label: '복잡한 예약', value: 'reservation' },
      ],
      additionalLabel: '추가로 하고 싶은 말 (선택)',
      additionalPlaceholder: '예: 사진 찍기 좋은 곳이면 좋겠어',
      generateButton: '✨ 데이트 후보 만들기',
      back: '←',
    },
    course: {
      modeLabel: '코스로 정리해줘',
      title: '어떤 데이트를\n하고 싶어?',
      ideaLabel: '하고 싶은 데이트 아이디어',
      ideaPlaceholder: '예: 전시회 가고 싶어, 한강 피크닉 어때?',
      ideaHint: '대략적인 아이디어만 있어도 괜찮아요.',
      budgetLabel: '예산은 어느 정도?',
      budgetOptions: [
        { label: '아끼고 싶어', emoji: '💰', value: 'low' },
        { label: '적당히', emoji: '💳', value: 'medium' },
        { label: '특별하게', emoji: '✨', value: 'high' },
      ],
      durationLabel: '시간은 얼마나?',
      durationOptions: [
        { label: '2~3시간', emoji: '⏱️', value: '2-3h' },
        { label: '반나절', emoji: '🌤️', value: 'half_day' },
        { label: '하루종일', emoji: '☀️', value: 'full_day' },
      ],
      generateButton: '🗺️ 코스 만들기',
      back: '←',
      errorEmpty: '하고 싶은 아이디어를 입력해주세요.',
    },
    result: {
      title: '데이트 후보',
      loadingTitle: '후보를 만들고 있어요',
      loadingSubtitle: '잠깐만 기다려줘 ✨',
      errorTitle: '후보를 불러오지 못했어요',
      errorSubtitle: '네트워크를 확인하거나\n잠시 후 다시 시도해주세요.',
      retryButton: '← 다시 선택하기',
      backToMode: '다시 선택하기',
      saveButton: '💾 우리 후보에 저장하기',
      saved: '✅ 우리 후보에 저장됐어요!',
      goToFirst: '첫 번째 카드에 반응하기 →',
      goToCandidates: '우리 후보 전체 보기',
      cardTitle: '이런 데이트는\n어때요?',
      saveNetworkError: '네트워크가 불안정해요. 다시 시도해주세요.',
      saveLoginError: '로그인이 필요해요.',
      saveCoupleError: '커플 연결 후 저장할 수 있어요.',
      saveGeneralError: '저장 중 오류가 발생했어요. 다시 시도해주세요.',
    },
    candidates: {
      title: '우리 후보 💌',
      tabs: [
        { key: 'all', label: '전체' },
        { key: 'both', label: '둘 다 끌림 🔥' },
        { key: 'conditional', label: '조건부 😊' },
        { key: 'next', label: '다음에 ⏰' },
      ],
      modeLabels: {
        pick_for_me: '앱이 골라줘',
        feeling_only: '느낌만 말할게',
        make_course: '코스로 정리해줘',
        soft_message: '부드럽게 말해줘',
        light_date: '가볍게',
        special_date: '특별하게',
        next_time: '다음 만남',
        low_risk: '실패 확률 낮게',
      },
      reactionLabels: {
        love: { emoji: '🔥', label: '완전 끌려' },
        like: { emoji: '😊', label: '느낌은 좋아' },
        burden: { emoji: '😅', label: '오늘은 부담돼' },
        next_time: { emoji: '⏰', label: '다음에' },
      },
      emptyTitle: '아직 후보가 없어요.',
      emptySubtitle: '데이트 모드에서 카드를 만들어보세요!',
      emptyTabSubtitle: '해당하는 후보가 없어요.',
      goMode: '데이트 모드 시작하기 →',
      loading: '후보를 불러오는 중...',
      error: '후보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      tapHint: '탭해서 반응하기 →',
    },
    softMessage: {
      title: '마음 전하기 💬',
      subtitle: '말하기 어려운 마음을 골라주세요.\n앱이 부드럽게 바꿔드릴게요.',
      stepTitle: '지금 어떤 마음인가요? (복수 선택 가능)',
      stepSubtitle: '추가로 전하고 싶은 말이 있나요? (선택)',
      reasons: [
        { key: 'tired', label: '피곤해요', emoji: '😴' },
        { key: 'budget', label: '예산이 부담돼요', emoji: '💸' },
        { key: 'far', label: '멀리 가기 싫어요', emoji: '🏠' },
        { key: 'sorry', label: '거절하기 미안해요', emoji: '🥺' },
        { key: 'near', label: '가까운 곳이 좋아요', emoji: '📍' },
        { key: 'crowded', label: '사람 많은 곳은 싫어요', emoji: '😬' },
        { key: 'time', label: '시간이 촉박해요', emoji: '⏰' },
        { key: 'weather', label: '날씨가 맞지 않아요', emoji: '🌧️' },
      ],
      additionalLabel: '추가로 전하고 싶은 말이 있나요? (선택)',
      additionalPlaceholder: '예: 다음 주엔 꼭 같이 가고 싶어',
      createButton: '문장 만들기 ✨',
      resultTitle: '마음 전하기 💬',
      resultSubtitle: 'AI가 만들어준 문장이에요.\n직접 수정하고 복사해서 보내보세요.',
      messageLabel: '내 마음 문장',
      autoSendNotice: '✋ 앱이 자동으로 보내지 않아요. 직접 확인하고 전송해주세요.',
      copyButton: '📋 클립보드에 복사',
      copiedButton: '✅ 복사됐어요!',
      saveButton: '저장하기',
      resetButton: '다시 만들기',
      errorNeedReason: '전달하고 싶은 마음을 하나 이상 선택해주세요.',
      errorCoupleRequired: '커플 연결이 필요해요.',
      errorSave: '저장 중 문제가 발생했어요.',
    },
    memories: {
      title: '추억',
      subtitle: '완료한 데이트를 모아봤어요',
      loading: '추억을 불러오는 중...',
      emptyTitle: '아직 완료한 데이트가 없어요',
      emptySubtitle: '데이트 후보 카드에서\n"이 데이트 완료했어요"를 눌러보세요',
      wantAgainYes: '또 가고 싶어요',
      wantAgainNo: '한 번이면 충분',
      modeLabels: {
        pick_for_me: '앱이 골라줘',
        feeling_only: '느낌만 말할게',
        make_course: '코스로 정리해줘',
        soft_message: '부드럽게 말해줘',
        light_date: '가볍게',
        special_date: '특별하게',
        next_time: '다음 만남',
        low_risk: '실패 확률 낮게',
      },
    },
    card: {
      title: '데이트 후보',
      loading: '카드를 불러오는 중...',
      missing: '카드를 불러올 수 없어요.',
      reactionTitle: '내 반응',
      reactionSubtitle: '끌리는 느낌만 골라주세요',
      partnerWaiting: '⏳ 상대방 반응을 기다리는 중...',
      partnerReaction: (label: string, emoji: string) => `상대방 반응: ${emoji} ${label}`,
      memoryButton: '이 데이트 완료했어요',
      memoryDone: '완료한 데이트예요',
      saveError: '저장에 실패했어요. 다시 시도해주세요.',
      confirmButton: '이번 데이트로 정할까요? →',
      reactionLabels: {
        love: { emoji: '🔥', label: '완전 끌려' },
        like: { emoji: '😊', label: '느낌은 좋아' },
        burden: { emoji: '😅', label: '오늘은 부담돼' },
        next_time: { emoji: '⏰', label: '다음에' },
      },
      modeLabels: {
        pick_for_me: '앱이 골라줘',
        feeling_only: '느낌만 말할게',
        make_course: '코스로 정리해줘',
        soft_message: '부드럽게 말해줘',
        light_date: '가볍게',
        special_date: '특별하게',
        next_time: '다음 만남',
        low_risk: '실패 확률 낮게',
      },
    },
    confirm: {
      heading: '이번 데이트로 정할까요?',
      sub: '날짜와 시간은 나중에 바꿔도 괜찮아요.',
      dateLabel: '날짜 정하기',
      timeLabel: '시간 정하기',
      placeLabel: '장소 메모',
      itemsLabel: '준비할 것',
      datePlaceholder: '예: 5월 26일 (화)',
      timePlaceholder: '예: 저녁 7시',
      placePlaceholder: '예: 홍대 맛집',
      itemsPlaceholder: '예: 우산, 카메라',
      saveButton: '이번 데이트로 저장',
      keepButton: '아직 후보로 둘게요',
      saveError: '저장에 실패했어요. 다시 시도해주세요.',
    },
    review: {
      heading: '오늘 데이트 어땠어요?',
      sub: '가볍게 남기면 다음 추천이 더 잘 맞아요.',
      ratingLabel: '전반적으로 어땠나요?',
      ratings: [
        { key: 'love', label: '다시 하고 싶어' },
        { key: 'good', label: '좋았어' },
        { key: 'ok', label: '무난했어' },
        { key: 'change', label: '다음엔 조금 바꾸고 싶어' },
      ],
      reviewLabel: '한 줄 후기',
      reviewPlaceholder: '오늘 데이트 한 마디로 남기기',
      saveButton: '추억으로 저장',
      noRatingError: '전반적인 평가를 선택해주세요.',
      saveError: '저장에 실패했어요. 다시 시도해주세요.',
      missingCoupleError: '커플 정보를 불러올 수 없어요.',
    },
    notifications: {
      title: '알림',
      unreadSuffix: '개 읽지 않음',
      allRead: '모두 확인했어요',
      clearAll: '모두 지우기',
      emptyTitle: '새 알림이 없어요',
      emptyBody: '상대의 반응이나 새 추천이 오면\n여기에서 알려드릴게요.',
      groupToday: '오늘',
      groupWeek: '이번 주',
      groupEarlier: '이전',
      reactionTitle: '상대가 반응을 남겼어요',
      newCardTitle: '새 데이트 추천이 도착했어요',
      softMessageTitle: '다정한 문장이 도착했어요',
      timeJustNow: '방금',
      timeMinutes: '분 전',
      timeHours: '시간 전',
      timeYesterday: '어제',
      timeDays: '일 전',
      modalCopyButton: '복사하기',
      modalCloseButton: '닫기',
    },
  },
  en: {
    language: { ko: 'Korean', en: 'English' },
    common: {
      back: '←',
      next: 'Next',
      done: 'Done',
      save: 'Save',
      skip: 'Skip',
      loading: 'Loading...',
      retry: 'Try again',
    },
    tabs: {
      home: 'Home',
      mode: 'Date Mode',
      candidates: 'Candidates',
      softMessage: 'Soft Message',
      memories: 'Memories',
    },
    settings: {
      title: 'My Account',
      subtitle: 'Manage your nickname, password, and language.',
      languageTitle: 'App language',
      languageSubtitle: 'Choose the language DateMate should use.',
      currentLanguage: 'Current language',
      korean: 'Korean',
      english: 'English',
      accountTitle: 'Account',
      logout: 'Log out',
      nicknameTitle: 'Change nickname',
      nicknamePlaceholder: 'Nickname',
      nicknameSave: 'Update',
      nicknameSaving: 'Saving...',
      nicknameSuccess: 'Nickname updated.',
      nicknameEmpty: 'Please enter a nickname.',
      nicknameError: 'Could not update nickname.',
      passwordTitle: 'Change password',
      passwordPlaceholder: 'New password (6+ characters)',
      passwordSave: 'Update',
      passwordSaving: 'Updating...',
      passwordSuccess: 'Password updated.',
      passwordShort: 'Password must be at least 6 characters.',
      passwordError: 'Could not update password.',
      deleteTitle: 'Delete account',
      deleteWarning: 'Deleting your account will permanently remove your profile, preferences, and message history. Shared date cards and reactions will remain visible to your partner.',
      deleteButton: 'Delete account',
      deleteConfirmTitle: 'Are you sure?',
      deleteConfirmMessage: 'Type "delete" below to confirm.',
      deleteConfirmPlaceholder: 'delete',
      deleteConfirmKeyword: 'delete',
      deleteConfirmAction: 'Confirm deletion',
      deleteCancel: 'Cancel',
      deleteError: 'Something went wrong. Please try again later.',
      deleteDeleting: 'Deleting...',
      nameEmpty: 'No nickname',
      partnerFallback: 'your partner',
      daysWith: (partner: string, days: number) => `Day ${days} with ${partner}`,
      statDates: 'Dates together',
      statWantAgain: 'Want again',
      rowNickname: 'Nickname',
      rowCouple: 'Partner connection',
      rowPassword: 'Change password',
      prefsTitle: 'Preferences',
      rowNotifications: 'Notifications',
      rowLanguage: 'Language',
      infoTitle: 'Info',
      rowHelp: 'Help',
      rowTerms: 'Terms of Service',
      rowPrivacy: 'Privacy Policy',
      langPickTitle: 'Select language',
      langPickMessage: 'Choose your app language.',
      cancel: 'Cancel',
      helpTitle: 'Help',
      helpMessage: 'For any questions, contact jake051096@gmail.com.',
    },
    auth: {
      appName: 'DateMate 💕',
      subtitle: 'You do not have to plan every date alone.',
      emailPlaceholder: 'Email',
      passwordPlaceholder: 'Password (6+ chars)',
      signIn: 'Log in',
      signingIn: 'Working...',
      signUp: 'Sign up',
      toSignUp: 'No account yet? Sign up',
      toSignIn: 'Already have an account? Log in',
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      languageHint: 'Language',
      errorEmail: 'Please enter your email.',
      errorPassword: 'Password must be at least 6 characters.',
      errorGeneric: 'Something went wrong. Please try again.',
      errorInvalidLogin: 'The email or password is incorrect.',
      errorRegistered: 'This email is already registered.',
      errorNeedConfirmation: 'You need to confirm your email.',
      errorInvalidEmail: 'Please enter a valid email address.',
      errorRateLimit: 'Please try again later.',
      errorNetwork: 'Please check your network connection.',
    },
    home: {
      greeting: (name?: string) => (name ? `${name},` : 'Hello,'),
      ask: 'What kind of help do you need today?',
      connected: (partnerName: string) => `💑 Connected with ${partnerName}`,
      connect: '💌 Connect with partner',
      startMode: 'Start Date Mode',
      logout: 'Log out',
    },
    nickname: {
      title: 'What should we call you?',
      subtitle: 'Choose the nickname your partner will see.',
      placeholder: 'Nickname',
      next: 'Next',
      saving: 'Saving...',
      alertEmpty: 'Please enter a nickname.',
      alertNoUser: 'Could not find your login session.',
      alertError: 'Something went wrong.',
    },
    coupleConnect: {
      title: 'Connect with your partner',
      subtitle: 'Create a code to share\nor enter the one you received.',
      createTitle: 'Create a code',
      createDesc: 'Share your code with your partner.',
      share: 'Share',
      wait: 'I will wait for my partner to join →',
      createButton: 'Create code',
      inputTitle: 'Enter a code',
      inputDesc: 'Type the code your partner sent you.',
      codePlaceholder: '6-digit code',
      connectButton: 'Connect',
      alertNoUser: 'Could not find your login session.',
      alertDuplicateTitle: 'A code already exists',
      alertDuplicateDesc: "Use the code you created earlier or enter your partner's code.",
      alertNetwork: 'Please check your network connection.',
      alertCreateError: 'Something went wrong while creating the code. Please try again.',
      alertCodeEmpty: 'Please enter a code.',
      alertCodeNotFoundTitle: 'Code not found',
      alertCodeNotFoundDesc: 'Please check the code again.\nMake sure the letters are capitalized correctly.',
      alertOwnCodeTitle: 'This is your own code',
      alertOwnCodeDesc: 'Share this code with your partner and have them enter it instead.',
      alertJoinNetwork: 'Please check your network connection.',
      alertJoinError: 'Something went wrong while connecting. Please try again.',
      shareMessage: (code: string) => `DateMate partner code: ${code}`,
    },
    preferences: {
      stepTitles: ['What kind of date sounds good?', 'What would you rather avoid?', 'Are you long-distance?', 'When it comes to planning dates...'],
      stepSubs: ['You can choose more than one', 'A little honesty helps the suggestions', 'Tell us what your usual setup looks like', 'Pick the one that feels closest'],
      preferredOptions: ['Restaurants', 'Cafes', 'Walks', 'Home dates', 'Culture / Exhibitions', 'Activities'],
      avoidOptions: ['Long travel', 'Big spending', 'Crowded places', 'Long walks', 'Complicated reservations'],
      longDistanceOptions: [
        { value: true, label: 'Yes, we are long-distance' },
        { value: false, label: 'No, we live in the same area' },
      ],
      planningStyles: ['Usually the planner', 'We decide together', 'I can choose, but planning is hard', 'I struggle to express my opinion', 'It depends on the day'],
      skip: 'Skip',
      next: 'Next',
      done: 'Done',
      back: '←',
      saving: 'Saving...',
      alertSaveError: 'Could not save your preferences. Please try again.',
    },
    mode: {
      title: 'How can I\nhelp today?',
      modes: [
        { id: 'pick_for_me', emoji: '🎲', label: 'Pick for me', desc: 'Answer a few prompts and get three date ideas' },
        { id: 'feeling_only', emoji: '🌸', label: 'Just the vibe', desc: 'Choose the mood you want. That is enough.' },
        { id: 'make_course', emoji: '🗺️', label: 'Make it a plan', desc: 'Turn a rough idea into a simple course' },
        { id: 'soft_message', emoji: '💬', label: 'Say it gently', desc: 'Turn a hard-to-say feeling into a kinder message' },
        { id: 'light_date', emoji: '🧸', label: 'Keep it easy', desc: 'Low-effort dates for tired days' },
        { id: 'special_date', emoji: '🌟', label: 'Make it special', desc: 'Something a little more memorable' },
        { id: 'next_time', emoji: '📅', label: 'Next time', desc: 'Save ideas for the next time you meet' },
        { id: 'low_risk', emoji: '🛡️', label: 'Low risk', desc: 'Comfortable picks that are hard to mess up' },
      ],
    },
    feeling: {
      modeTitles: {
        pick_for_me: 'Let me pick for you',
        feeling_only: 'Just tell me the vibe',
        light_date: 'Keep it light',
        low_risk: 'Keep it low-risk',
        special_date: 'A special date',
        next_time: 'Plan for next time',
        make_course: 'Turn it into a course',
        soft_message: 'Say it softly',
      },
      steps: [
        {
          key: 'energy',
          question: 'How is your energy\ntoday?',
          options: [
            { label: 'Tired', emoji: '😴', value: 'low' },
            { label: 'Okay', emoji: '😊', value: 'medium' },
            { label: 'Full of energy', emoji: '🎉', value: 'high' },
          ],
        },
        {
          key: 'budget',
          question: 'What budget\nare you thinking about?',
          options: [
            { label: 'Keep it cheap', emoji: '💰', value: 'low' },
            { label: 'Moderate', emoji: '💳', value: 'medium' },
            { label: 'Make it special', emoji: '✨', value: 'high' },
          ],
        },
        {
          key: 'distance',
          question: 'How far are\nyou okay going?',
          options: [
            { label: 'Nearby', emoji: '🏠', value: 'near' },
            { label: 'Any distance', emoji: '🚗', value: 'any' },
            { label: 'Far is okay', emoji: '🚂', value: 'far' },
          ],
        },
        {
          key: 'mood',
          question: 'What kind of vibe\ndo you want?',
          options: [
            { label: 'Comfortable', emoji: '🛋️', value: 'comfortable' },
            { label: 'Fun', emoji: '🎡', value: 'fun' },
            { label: 'Romantic', emoji: '🌹', value: 'romantic' },
          ],
        },
        {
          key: 'duration',
          question: 'How much time\ncan you spend?',
          options: [
            { label: '1 hour', emoji: '⏰', value: '1h' },
            { label: '2-3 hours', emoji: '⏱️', value: '2-3h' },
            { label: 'Half day', emoji: '🌤️', value: 'half_day' },
            { label: 'All day', emoji: '☀️', value: 'full_day' },
          ],
        },
      ],
      finalStep: 'Final step',
      avoidQuestion: 'Anything you want to avoid?\n(optional)',
      avoidOptions: [
        { label: 'Long walks', value: 'long_walk' },
        { label: 'Crowded places', value: 'crowded' },
        { label: 'Outdoor activities', value: 'outdoor' },
        { label: 'Expensive places', value: 'expensive' },
        { label: 'Complicated reservations', value: 'reservation' },
      ],
      additionalLabel: 'Anything else to add? (optional)',
      additionalPlaceholder: 'For example: somewhere nice for photos would be great',
      generateButton: '✨ Make date ideas',
      back: '←',
    },
    course: {
      modeLabel: 'Make it a plan',
      title: 'What kind of date\ndo you have in mind?',
      ideaLabel: 'Your date idea',
      ideaPlaceholder: 'e.g. I want to visit an exhibition, how about a picnic?',
      ideaHint: 'A rough idea is totally fine.',
      budgetLabel: 'What is your budget?',
      budgetOptions: [
        { label: 'Keep it cheap', emoji: '💰', value: 'low' },
        { label: 'Moderate', emoji: '💳', value: 'medium' },
        { label: 'Make it special', emoji: '✨', value: 'high' },
      ],
      durationLabel: 'How much time do you have?',
      durationOptions: [
        { label: '2-3 hours', emoji: '⏱️', value: '2-3h' },
        { label: 'Half day', emoji: '🌤️', value: 'half_day' },
        { label: 'All day', emoji: '☀️', value: 'full_day' },
      ],
      generateButton: '🗺️ Build a course',
      back: '←',
      errorEmpty: 'Please enter a date idea first.',
    },
    result: {
      title: 'Date ideas',
      loadingTitle: 'Making date ideas',
      loadingSubtitle: 'Just a moment ✨',
      errorTitle: 'Could not make suggestions',
      errorSubtitle: 'Please check your network\nand try again later.',
      retryButton: '← Go back',
      backToMode: 'Try again',
      saveButton: '💾 Save to our candidates',
      saved: '✅ Saved to our candidates!',
      goToFirst: 'React to the first card →',
      goToCandidates: 'View all candidates',
      cardTitle: 'How about\none of these?',
      saveNetworkError: 'The network is unstable. Please try again.',
      saveLoginError: 'You need to log in first.',
      saveCoupleError: 'You can save after connecting with your partner.',
      saveGeneralError: 'Something went wrong while saving. Please try again.',
    },
    candidates: {
      title: 'Our candidates 💌',
      tabs: [
        { key: 'all', label: 'All' },
        { key: 'both', label: 'Both like it 🔥' },
        { key: 'conditional', label: 'Conditional 😊' },
        { key: 'next', label: 'Next time ⏰' },
      ],
      modeLabels: {
        pick_for_me: 'Pick for me',
        feeling_only: 'Just vibes',
        make_course: 'Turn it into a plan',
        soft_message: 'Say it softly',
        light_date: 'Keep it light',
        special_date: 'Make it special',
        next_time: 'Next time',
        low_risk: 'Low risk',
      },
      reactionLabels: {
        love: { emoji: '🔥', label: 'Really into it' },
        like: { emoji: '😊', label: 'Looks good' },
        burden: { emoji: '😅', label: 'Feels heavy today' },
        next_time: { emoji: '⏰', label: 'Next time' },
      },
      emptyTitle: 'No candidates yet.',
      emptySubtitle: 'Create a few cards in Date Mode.',
      emptyTabSubtitle: 'No candidates match this tab.',
      goMode: 'Start Date Mode →',
      loading: 'Loading candidates...',
      error: 'Could not load candidates. Please try again later.',
      tapHint: 'Tap to react →',
    },
    softMessage: {
      title: 'Say it gently 💬',
      subtitle: 'Choose what feels hard to say.\nDateMate will make it softer.',
      stepTitle: 'How are you feeling? (choose more than one)',
      stepSubtitle: 'Anything else you want to add? (optional)',
      reasons: [
        { key: 'tired', label: 'I am tired', emoji: '😴' },
        { key: 'budget', label: 'Budget feels tight', emoji: '💸' },
        { key: 'far', label: 'I do not want to travel far', emoji: '🏠' },
        { key: 'sorry', label: 'I feel bad saying no', emoji: '🥺' },
        { key: 'near', label: 'A nearby place is better', emoji: '📍' },
        { key: 'crowded', label: 'Crowded places are not my thing', emoji: '😬' },
        { key: 'time', label: 'I am short on time', emoji: '⏰' },
        { key: 'weather', label: 'The weather is not great', emoji: '🌧️' },
      ],
      additionalLabel: 'Anything else you want to say? (optional)',
      additionalPlaceholder: 'For example: I really want to go together next week',
      createButton: 'Make a message ✨',
      resultTitle: 'Say it gently 💬',
      resultSubtitle: 'Here is a softer version.\nEdit it, then copy it when it feels right.',
      messageLabel: 'My message',
      autoSendNotice: '✋ DateMate never sends this automatically. You stay in control.',
      copyButton: '📋 Copy to clipboard',
      copiedButton: '✅ Copied!',
      saveButton: 'Save',
      resetButton: 'Make again',
      errorNeedReason: 'Please choose at least one feeling to express.',
      errorCoupleRequired: 'You need to connect with your partner first.',
      errorSave: 'Something went wrong while saving.',
    },
    memories: {
      title: 'Memories',
      subtitle: 'Dates you have already done together',
      loading: 'Loading memories...',
      emptyTitle: 'No completed dates yet',
      emptySubtitle: 'Open a date card and tap\n"Completed this date"',
      wantAgainYes: 'I want to go again',
      wantAgainNo: 'Once is enough',
      modeLabels: {
        pick_for_me: 'Pick for me',
        feeling_only: 'Just vibes',
        make_course: 'Turn it into a plan',
        soft_message: 'Say it softly',
        light_date: 'Keep it light',
        special_date: 'Make it special',
        next_time: 'Next time',
        low_risk: 'Low risk',
      },
    },
    card: {
      title: 'Date card',
      loading: 'Loading card...',
      missing: 'Could not load the card.',
      reactionTitle: 'My reaction',
      reactionSubtitle: 'Pick the feeling that fits best',
      partnerWaiting: '⏳ Waiting for your partner’s reaction...',
      partnerReaction: (label: string, emoji: string) => `Partner reaction: ${emoji} ${label}`,
      memoryButton: 'Completed this date',
      memoryDone: 'This date is marked complete',
      saveError: 'Could not save. Please try again.',
      confirmButton: 'Make this the date? →',
      reactionLabels: {
        love: { emoji: '🔥', label: 'Really into it' },
        like: { emoji: '😊', label: 'Looks good' },
        burden: { emoji: '😅', label: 'Feels heavy today' },
        next_time: { emoji: '⏰', label: 'Next time' },
      },
      modeLabels: {
        pick_for_me: 'Pick for me',
        feeling_only: 'Just vibes',
        make_course: 'Turn it into a plan',
        soft_message: 'Say it softly',
        light_date: 'Keep it light',
        special_date: 'Make it special',
        next_time: 'Next time',
        low_risk: 'Low risk',
      },
    },
    confirm: {
      heading: 'Make this the date?',
      sub: 'You can always change the date or time later.',
      dateLabel: 'Date',
      timeLabel: 'Time',
      placeLabel: 'Place note',
      itemsLabel: 'Things to prepare',
      datePlaceholder: 'e.g. May 26 (Tue)',
      timePlaceholder: 'e.g. 7pm',
      placePlaceholder: 'e.g. Hongdae restaurant',
      itemsPlaceholder: 'e.g. Umbrella, camera',
      saveButton: 'Save as this date',
      keepButton: 'Keep it as a candidate',
      saveError: 'Could not save. Please try again.',
    },
    review: {
      heading: 'How was the date?',
      sub: 'A quick note helps future picks get better.',
      ratingLabel: 'Overall?',
      ratings: [
        { key: 'love', label: 'Want to do it again' },
        { key: 'good', label: 'It was great' },
        { key: 'ok', label: 'It was fine' },
        { key: 'change', label: 'A few tweaks next time' },
      ],
      reviewLabel: 'One-line review',
      reviewPlaceholder: 'What would you say in one line?',
      saveButton: 'Save as memory',
      noRatingError: 'Please pick an overall rating.',
      saveError: 'Could not save. Please try again.',
      missingCoupleError: 'Could not load couple info.',
    },
    notifications: {
      title: 'Notifications',
      unreadSuffix: ' unread',
      allRead: 'All caught up',
      clearAll: 'Clear all',
      emptyTitle: 'No notifications yet',
      emptyBody: "We'll let you know here when your\npartner reacts or new picks arrive.",
      groupToday: 'Today',
      groupWeek: 'This week',
      groupEarlier: 'Earlier',
      reactionTitle: 'Your partner reacted',
      newCardTitle: 'New date picks arrived',
      softMessageTitle: 'A gentle message arrived',
      timeJustNow: 'just now',
      timeMinutes: 'm ago',
      timeHours: 'h ago',
      timeYesterday: 'yesterday',
      timeDays: 'd ago',
      modalCopyButton: 'Copy',
      modalCloseButton: 'Close',
    },
  },
};

const I18N_CONTEXT = createContext<{
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  strings: Copy;
  ready: boolean;
} | null>(null);

function detectInitialLanguage(): AppLanguage {
  const locale = getLocales()[0];
  const languageTag = locale?.languageTag ?? locale?.languageCode ?? '';
  return languageTag.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!mounted) return;
        if (saved === 'ko' || saved === 'en') {
          setLanguageState(saved);
        }
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo(
    () => ({ language, setLanguage, strings: COPY[language], ready }),
    [language, ready],
  );

  return createElement(I18N_CONTEXT.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18N_CONTEXT);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
