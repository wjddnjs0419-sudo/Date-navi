export function buildCourseSavedParams(stepCount: number, titleCustomized: boolean) {
  return {
    mode: 'make_course' as const,
    step_count: stepCount,
    title_customized: titleCustomized,
  };
}

export function shouldTrackProposalSent(sourceScreen?: string) {
  return sourceScreen === 'course_recommendation_result';
}

export function buildProposalSentParams() {
  return {
    send_method: 'in_app' as const,
    source_screen: 'course_recommendation_result' as const,
  };
}
