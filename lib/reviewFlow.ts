// 데이트 완료(리뷰) 흐름의 순수 판정 로직.
// 커플 두 사람이 각자 리뷰를 남기며, 둘 다 리뷰했을 때만 데이트를 done으로 아카이브한다.

/** date_memories의 리뷰 작성자 목록에 나 아닌 사람이 있으면 상대가 이미 리뷰한 것이다. */
export function partnerHasReviewed(reviewerUserIds: string[], myUserId: string): boolean {
  return reviewerUserIds.some((userId) => userId !== myUserId);
}
