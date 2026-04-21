import { ReviewLog } from '../api/review-log/model';
import { resolveUserId } from '../config/learning';
import type { DiscoveryAssessment } from './learningScheduler';
import { summarizeDueReviewProgress } from './learningScheduler';
import { ensureDueReviewList } from './dueReview';

type DiscoveryQuotaAssessment = Exclude<DiscoveryAssessment, 'mastered'>;

export const DISCIPLINE_DAILY_NEW_WORD_LIMITS: Record<DiscoveryQuotaAssessment, number> = {
  familiar: 20,
  uncertain: 10,
  unknown: 5
};
export const DISCIPLINE_DAILY_NEW_WORD_LIMIT = Object.values(DISCIPLINE_DAILY_NEW_WORD_LIMITS)
  .reduce((sum, limit) => sum + limit, 0);
export const DISCIPLINE_BACKLOG_HARD_LIMIT = 30;

export type DisciplineEntryState = 'open' | 'soft_locked' | 'hard_locked' | 'quota_reached';

export type DailyNewWordQuotaMap = Record<DiscoveryQuotaAssessment, number>;

export type DisciplineStatus = {
  dueReviewListId: string;
  dueCount: number;
  backlog: number;
  dailyNewWordLimit: number;
  dailyNewWordLimits: DailyNewWordQuotaMap;
  newWordsAddedToday: number;
  newWordsAddedTodayByAssessment: DailyNewWordQuotaMap;
  remainingNewWordQuota: number;
  remainingNewWordQuotaByAssessment: DailyNewWordQuotaMap;
  entryState: DisciplineEntryState;
  canAccessExploration: boolean;
};

const getTodayBounds = (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const emptyQuotaMap = (): DailyNewWordQuotaMap => ({
  familiar: 0,
  uncertain: 0,
  unknown: 0
});

const mapDiscoveryRatingToAssessment = (rating: string): DiscoveryQuotaAssessment | null => {
  switch (rating) {
    case 'easy':
      return 'familiar';
    case 'good':
      return 'uncertain';
    case 'again':
    case 'hard':
      return 'unknown';
    default:
      return null;
  }
};

const countNewWordsAddedToday = async (userId: string, now = new Date()) => {
  const { start, end } = getTodayBounds(now);
  const results = await ReviewLog.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        userId,
        questionType: 'discovery_assessment',
        answeredAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$rating',
        total: { $sum: 1 }
      }
    }
  ]);

  const countsByAssessment = emptyQuotaMap();
  for (const result of results) {
    const assessment = mapDiscoveryRatingToAssessment(result._id);
    if (!assessment) {
      continue;
    }

    countsByAssessment[assessment] += result.total;
  }

  return countsByAssessment;
};

export const getDisciplineStatus = async (userIdOrHeaderValue: string | string[] | undefined) => {
  const userId = resolveUserId(userIdOrHeaderValue);
  const [dueReviewList, dueProgress, newWordsAddedTodayByAssessment] = await Promise.all([
    ensureDueReviewList(),
    summarizeDueReviewProgress(userId),
    countNewWordsAddedToday(userId)
  ]);

  const backlog = dueProgress.dueCount || 0;
  const newWordsAddedToday = Object.values(newWordsAddedTodayByAssessment)
    .reduce((sum, count) => sum + count, 0);
  const remainingNewWordQuotaByAssessment = (
    Object.entries(DISCIPLINE_DAILY_NEW_WORD_LIMITS) as Array<[DiscoveryQuotaAssessment, number]>
  ).reduce((accumulator, [assessment, limit]) => {
    accumulator[assessment] = Math.max(0, limit - newWordsAddedTodayByAssessment[assessment]);
    return accumulator;
  }, emptyQuotaMap());
  const quotaRemainingByDailyCap = Object.values(remainingNewWordQuotaByAssessment)
    .reduce((sum, count) => sum + count, 0);
  const remainingNewWordQuota = backlog > 0 ? 0 : quotaRemainingByDailyCap;

  let entryState: DisciplineEntryState = 'open';
  if (backlog >= DISCIPLINE_BACKLOG_HARD_LIMIT) {
    entryState = 'hard_locked';
  } else if (backlog > 0) {
    entryState = 'soft_locked';
  } else if (quotaRemainingByDailyCap <= 0) {
    entryState = 'quota_reached';
  }

  return {
    dueReviewListId: dueReviewList._id.toString(),
    dueCount: dueProgress.dueCount || 0,
    backlog,
    dailyNewWordLimit: DISCIPLINE_DAILY_NEW_WORD_LIMIT,
    dailyNewWordLimits: { ...DISCIPLINE_DAILY_NEW_WORD_LIMITS },
    newWordsAddedToday,
    newWordsAddedTodayByAssessment,
    remainingNewWordQuota,
    remainingNewWordQuotaByAssessment,
    entryState,
    canAccessExploration: entryState === 'open'
  } satisfies DisciplineStatus;
};
