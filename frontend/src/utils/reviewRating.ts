import { ReviewRating } from '../types';

type Difficulty = 'easy' | 'medium' | 'hard';

type RecommendReviewRatingParams = {
  isCorrect: boolean;
  responseTimeMs: number;
  usedHint: boolean;
  difficulty: Difficulty;
  questionType?: string;
};

const MATCHING_TIME_DIVISOR = 2.5;

const downgradeRating = (rating: Exclude<ReviewRating, 'again'>): Exclude<ReviewRating, 'again'> => {
  if (rating === 'easy') return 'good';
  if (rating === 'good') return 'hard';
  return 'hard';
};

const thresholdMap: Record<Difficulty, { easyMs: number; goodMs: number }> = {
  easy: { easyMs: 4500, goodMs: 10000 },
  medium: { easyMs: 6500, goodMs: 13000 },
  hard: { easyMs: 8500, goodMs: 17000 }
};

export const getRatedResponseTimeMs = (responseTimeMs: number, questionType?: string) => {
  if (questionType === 'matching') {
    return Math.round(responseTimeMs / MATCHING_TIME_DIVISOR);
  }

  return responseTimeMs;
};

export const formatResponseTime = (responseTimeMs: number) => {
  if (responseTimeMs < 1000) {
    return `${responseTimeMs}ms`;
  }

  return `${(responseTimeMs / 1000).toFixed(1)}s`;
};

export const recommendReviewRating = ({
  isCorrect,
  responseTimeMs,
  usedHint,
  difficulty,
  questionType
}: RecommendReviewRatingParams): { rating: ReviewRating; reason: string } => {
  if (!isCorrect) {
    return {
      rating: 'again',
      reason: '本题答错，系统会按 again 处理。'
    };
  }

  const ratedResponseTimeMs = getRatedResponseTimeMs(responseTimeMs, questionType);
  const thresholds = thresholdMap[difficulty];
  let rating: Exclude<ReviewRating, 'again'> = 'hard';

  if (ratedResponseTimeMs <= thresholds.easyMs) {
    rating = 'easy';
  } else if (ratedResponseTimeMs <= thresholds.goodMs) {
    rating = 'good';
  }

  let reason = `本题耗时 ${formatResponseTime(ratedResponseTimeMs)}，推荐评为 ${rating}。`;

  if (questionType === 'matching') {
    reason = `${reason} 配对题已按 ${MATCHING_TIME_DIVISOR} 倍选项负担做耗时折算。`;
  }

  if (usedHint) {
    rating = downgradeRating(rating);
    reason = `${reason} 由于使用了提示，已自动下调一档。`;
  }

  return { rating, reason };
};
