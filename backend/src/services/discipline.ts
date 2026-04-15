import mongoose from 'mongoose';
import { Word } from '../api/words/model';
import { WordList } from '../api/lists/model';
import { resolveUserId } from '../config/learning';
import { summarizeDueReviewProgress } from './learningScheduler';
import { ensureDueReviewList } from './dueReview';

export const DISCIPLINE_DAILY_NEW_WORD_LIMIT = 10;
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

const countNewWordsAddedToday = async (now = new Date()) => {
  const customListIds = (await WordList.find({ kind: 'custom' }).select('_id').lean())
    .map((list) => list._id as mongoose.Types.ObjectId);

  if (!customListIds.length) {
    return 0;
  }

  const { start, end } = getTodayBounds(now);
  const [result] = await Word.aggregate<{ total: number }>([
    { $unwind: '$listMemberships' },
    {
      $match: {
        'listMemberships.listId': { $in: customListIds },
        'listMemberships.addedAt': { $gte: start, $lte: end }
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
    countNewWordsAddedToday()
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
