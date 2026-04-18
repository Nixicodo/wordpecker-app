import { ReviewLog } from '../api/review-log/model';
import { resolveUserId } from '../config/learning';
import { summarizeDueReviewProgress } from './learningScheduler';
import { ensureDueReviewList } from './dueReview';

export const DISCIPLINE_DAILY_NEW_WORD_LIMIT = 15;
export const DISCIPLINE_BACKLOG_HARD_LIMIT = 30;

export type DisciplineEntryState = 'open' | 'soft_locked' | 'hard_locked' | 'quota_reached';

export type DisciplineStatus = {
  dueReviewListId: string;
  dueCount: number;
  backlog: number;
  dailyNewWordLimit: number;
  newWordsAddedToday: number;
  remainingNewWordQuota: number;
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

const countNewWordsAddedToday = async (userId: string, now = new Date()) => {
  const { start, end } = getTodayBounds(now);
  const [result] = await ReviewLog.aggregate<{ total: number }>([
    {
      $match: {
        userId,
        questionType: 'discovery_assessment',
        answeredAt: { $gte: start, $lte: end }
      }
    },
    { $count: 'total' }
  ]);

  return result?.total || 0;
};

export const getDisciplineStatus = async (userIdOrHeaderValue: string | string[] | undefined) => {
  const userId = resolveUserId(userIdOrHeaderValue);
  const [dueReviewList, dueProgress, newWordsAddedToday] = await Promise.all([
    ensureDueReviewList(),
    summarizeDueReviewProgress(userId),
    countNewWordsAddedToday(userId)
  ]);

  const backlog = dueProgress.dueCount || 0;
  const quotaRemainingByDailyCap = Math.max(0, DISCIPLINE_DAILY_NEW_WORD_LIMIT - newWordsAddedToday);
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
    newWordsAddedToday,
    remainingNewWordQuota,
    entryState,
    canAccessExploration: entryState === 'open'
  } satisfies DisciplineStatus;
};
