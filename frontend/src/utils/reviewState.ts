type ReviewStateLike = {
  dueAt?: string;
  reviewCount?: number;
  status?: number;
};

export const hasStartedReviewFlow = (state: ReviewStateLike) =>
  (state.reviewCount ?? 0) > 0 && state.status !== 0;

export const isDueForReview = (state: ReviewStateLike, now = Date.now()) => {
  if (!hasStartedReviewFlow(state) || !state.dueAt) {
    return false;
  }

  const dueAt = new Date(state.dueAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= now;
};
