import mongoose from 'mongoose';
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { LearningState, ReviewRating, ReviewSource, type ILearningState } from '../api/learning-state/model';
import { ReviewLog, type IReviewLog } from '../api/review-log/model';
import { IWord, Word } from '../api/words/model';
import { IWordList, WordList } from '../api/lists/model';
import { isMistakeBookList } from './mistakeBook';
import { getDueReviewCutoff, isDueReviewList } from './dueReview';

const scheduler = fsrs({
  enable_fuzz: false,
  request_retention: 0.9
});

export type ReviewSubmission = {
  wordId: string;
  wordIds?: string[];
  selfAssessedWordIds?: string[];
  sourceListId?: string;
  sourceListIdByWordId?: Record<string, string>;
  rating: ReviewRating;
  correct: boolean;
  questionType: string;
  responseTimeMs?: number;
  usedHint?: boolean;
};

export type ScheduledWord = {
  id: string;
  value: string;
  meaning: string;
  sourceListId?: string;
  sourceListIds?: string[];
  sourceListName?: string;
  sourceListNames?: string[];
  state: {
    dueAt: string;
    lastReviewedAt?: string;
    stability: number;
    difficulty: number;
    reviewCount: number;
    lapseCount: number;
    consecutiveCorrect: number;
    consecutiveWrong: number;
    retrievability: number;
    status: 'new' | 'learning' | 'review' | 'relearning';
    urgency: number;
    challengeScore: number;
    behaviorRisk: number;
    hintUsageRate: number;
    averageResponseTimeMs?: number;
  };
};

type InitialSeed = {
  rating: Grade;
  repeat: number;
};

type ReviewBehaviorStats = {
  recentReviewCount: number;
  averageResponseTimeMs?: number;
  hintUsageRate: number;
  hardRate: number;
  againRate: number;
  behaviorRisk: number;
};

type ExpandedReviewSubmission = Omit<ReviewSubmission, 'wordIds' | 'selfAssessedWordIds' | 'sourceListIdByWordId'> & {
  sourceListId?: string;
};

const ratingMap: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Again,
  good: Rating.Good,
  easy: Rating.Easy
};

const ratingSeverity: Record<ReviewRating, number> = {
  easy: 0,
  good: 1,
  hard: 2,
  again: 3
};

const stateNameMap: Record<State, ScheduledWord['state']['status']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning'
};

const hasStartedReviewFlow = (
  state: Pick<ILearningState, 'reviewCount' | 'state'>
) => state.reviewCount > 0 && state.state !== State.New;

const RECENT_LOG_LIMIT = 400;
const RECENT_LOGS_PER_WORD = 6;

const emptyReviewBehaviorStats = (): ReviewBehaviorStats => ({
  recentReviewCount: 0,
  averageResponseTimeMs: undefined,
  hintUsageRate: 0,
  hardRate: 0,
  againRate: 0,
  behaviorRisk: 0
});

const buildSeedPlanFromLegacyPoint = (point: number): InitialSeed => {
  if (point >= 85) {
    return { rating: Rating.Easy, repeat: 5 };
  }

  if (point >= 65) {
    return { rating: Rating.Good, repeat: 4 };
  }

  if (point >= 45) {
    return { rating: Rating.Good, repeat: 3 };
  }

  if (point >= 25) {
    return { rating: Rating.Good, repeat: 2 };
  }

  if (point > 0) {
    return { rating: Rating.Good, repeat: 1 };
  }

  return { rating: Rating.Good, repeat: 0 };
};

const cardFromState = (state: Pick<ILearningState, 'dueAt' | 'stability' | 'difficulty' | 'elapsedDays' | 'scheduledDays' | 'learningSteps' | 'reps' | 'lapses' | 'state' | 'lastReviewedAt'>): Card => ({
  due: state.dueAt,
  stability: state.stability,
  difficulty: state.difficulty,
  elapsed_days: state.elapsedDays,
  scheduled_days: state.scheduledDays,
  learning_steps: state.learningSteps,
  reps: state.reps,
  lapses: state.lapses,
  state: state.state,
  last_review: state.lastReviewedAt
});

const buildInitialCardFromLegacyPoint = (point: number, now: Date) => {
  const { rating, repeat } = buildSeedPlanFromLegacyPoint(point);
  let card = createEmptyCard(now);

  for (let index = 0; index < repeat; index += 1) {
    card = scheduler.next(card, now, rating).card;
  }

  return card;
};

const buildReviewBehaviorStats = (
  logs: Array<Pick<IReviewLog, 'rating' | 'responseTimeMs' | 'usedHint'>>
): ReviewBehaviorStats => {
  if (!logs.length) {
    return emptyReviewBehaviorStats();
  }

  const logsWithResponseTime = logs.filter((log) => typeof log.responseTimeMs === 'number');
  const averageResponseTimeMs = logsWithResponseTime.length
    ? Math.round(logsWithResponseTime.reduce((sum, log) => sum + (log.responseTimeMs || 0), 0) / logsWithResponseTime.length)
    : undefined;
  const hintUsageRate = logs.filter((log) => Boolean(log.usedHint)).length / logs.length;
  const hardRate = logs.filter((log) => log.rating === 'hard').length / logs.length;
  const againRate = logs.filter((log) => log.rating === 'again').length / logs.length;
  const slowBoost = averageResponseTimeMs ? Math.min(1, Math.max(0, averageResponseTimeMs - 6000) / 12000) : 0;
  const struggleBoost = Math.min(1, againRate + hardRate * 0.7);
  const behaviorRisk = Math.min(1, slowBoost * 0.4 + hintUsageRate * 0.25 + struggleBoost * 0.35);

  return {
    recentReviewCount: logs.length,
    averageResponseTimeMs,
    hintUsageRate,
    hardRate,
    againRate,
    behaviorRisk
  };
};

const buildWordReviewBehaviorMap = async (userId: string, listId?: string) => {
  const recentLogs = await ReviewLog.find(listId ? { userId, listId } : { userId })
    .sort({ answeredAt: -1 })
    .limit(RECENT_LOG_LIMIT)
    .lean();

  const groupedLogs = new Map<string, typeof recentLogs>();
  for (const log of recentLogs) {
    const wordId = log.wordId.toString();
    const currentLogs = groupedLogs.get(wordId) || [];
    if (currentLogs.length < RECENT_LOGS_PER_WORD) {
      currentLogs.push(log);
      groupedLogs.set(wordId, currentLogs);
    }
  }

  const behaviorMap = new Map<string, ReviewBehaviorStats>();
  for (const [wordId, logs] of groupedLogs.entries()) {
    behaviorMap.set(wordId, buildReviewBehaviorStats(logs));
  }

  return { behaviorMap, recentLogs };
};

const normalizeReviewResults = (results: ReviewSubmission[]): ExpandedReviewSubmission[] => results.flatMap((result) => {
  const wordIds = Array.from(new Set([result.wordId, ...(result.wordIds || [])].filter(Boolean)));
  const selfAssessedWordIds = Array.from(new Set((result.selfAssessedWordIds || []).filter(Boolean)));
  const settledWordIdSet = new Set(wordIds);
  const resolveSourceListId = (wordId: string) => result.sourceListIdByWordId?.[wordId] || result.sourceListId;
  const settleRating = (wordId: string): ReviewRating => (
    selfAssessedWordIds.includes(wordId) && ratingSeverity[result.rating] < ratingSeverity.hard
      ? 'hard'
      : result.rating
  );

  const directResults = wordIds.map((wordId) => ({
    ...result,
    wordId,
    rating: settleRating(wordId),
    sourceListId: resolveSourceListId(wordId),
    wordIds: undefined,
    selfAssessedWordIds: undefined,
    sourceListIdByWordId: undefined
  }));

  const selfAssessmentResults = selfAssessedWordIds
    .filter((wordId) => !settledWordIdSet.has(wordId))
    .map((wordId) => ({
      ...result,
      wordId,
      wordIds: undefined,
      selfAssessedWordIds: undefined,
      correct: true,
      rating: 'hard' as ReviewRating,
      questionType: `${result.questionType}_self_assessment`,
      sourceListId: resolveSourceListId(wordId),
      sourceListIdByWordId: undefined
    }));

  return [...directResults, ...selfAssessmentResults];
});

const computeWordChallengeScore = (
  state: ILearningState,
  retrievability: number,
  behaviorStats: ReviewBehaviorStats
) => {
  const forgettingRisk = 1 - retrievability;
  const wrongPressure = Math.min(1, state.consecutiveWrong / 3);
  const lowStabilityPressure = Math.max(0, 1 - Math.min(1, state.stability / 8));
  const stateDifficultyPressure = Math.min(1, state.difficulty / 10);

  return Math.min(
    1,
    forgettingRisk * 0.3 +
      wrongPressure * 0.2 +
      lowStabilityPressure * 0.15 +
      stateDifficultyPressure * 0.15 +
      behaviorStats.behaviorRisk * 0.2
  );
};

const computeUrgency = (
  state: ILearningState,
  retrievability: number,
  now: Date,
  behaviorStats: ReviewBehaviorStats
) => {
  const overdueMs = Math.max(0, now.getTime() - state.dueAt.getTime());
  const overdueDays = overdueMs / (1000 * 60 * 60 * 24);
  const overdueBoost = Math.min(1, overdueDays / 7);
  const forgettingRisk = 1 - retrievability;
  const wrongBoost = Math.min(1, state.consecutiveWrong / 3);
  const lowExposureBoost = state.reviewCount === 0 ? 1 : Math.max(0, 1 - state.reviewCount / 8);
  const difficultyBoost = Math.min(1, state.difficulty / 10);

  return (
    forgettingRisk * 0.38 +
    overdueBoost * 0.18 +
    wrongBoost * 0.15 +
    lowExposureBoost * 0.09 +
    difficultyBoost * 0.1 +
    behaviorStats.behaviorRisk * 0.1
  );
};

const getMembership = (word: Pick<IWord, '_id' | 'value' | 'listMemberships'>, listId: string) =>
  word.listMemberships.find((membership) => membership.listId.toString() === listId);

const copyLearningMetrics = (
  target: ILearningState,
  source: Pick<
    ILearningState,
    | 'dueAt'
    | 'lastReviewedAt'
    | 'stability'
    | 'difficulty'
    | 'scheduledDays'
    | 'elapsedDays'
    | 'reps'
    | 'lapses'
    | 'learningSteps'
    | 'state'
    | 'reviewCount'
    | 'lapseCount'
    | 'consecutiveCorrect'
    | 'consecutiveWrong'
    | 'lastRating'
    | 'lastSource'
  >
) => {
  target.dueAt = source.dueAt;
  target.lastReviewedAt = source.lastReviewedAt;
  target.stability = source.stability;
  target.difficulty = source.difficulty;
  target.scheduledDays = source.scheduledDays;
  target.elapsedDays = source.elapsedDays;
  target.reps = source.reps;
  target.lapses = source.lapses;
  target.learningSteps = source.learningSteps;
  target.state = source.state;
  target.reviewCount = source.reviewCount;
  target.lapseCount = source.lapseCount;
  target.consecutiveCorrect = source.consecutiveCorrect;
  target.consecutiveWrong = source.consecutiveWrong;
  target.lastRating = source.lastRating;
  target.lastSource = source.lastSource;
};

const syncLearningStateAcrossMemberships = async (
  userId: string,
  word: Pick<IWord, '_id' | 'listMemberships'>,
  sourceState: ILearningState
) => {
  await Promise.all(
    word.listMemberships.map(async (membership) => {
      const targetListId = membership.listId.toString();
      if (targetListId === sourceState.listId.toString()) {
        return;
      }

      const mirroredState = await LearningState.findOneAndUpdate(
        { userId, wordId: word._id, listId: membership.listId },
        {
          $set: {
            dueAt: sourceState.dueAt,
            lastReviewedAt: sourceState.lastReviewedAt,
            stability: sourceState.stability,
            difficulty: sourceState.difficulty,
            scheduledDays: sourceState.scheduledDays,
            elapsedDays: sourceState.elapsedDays,
            reps: sourceState.reps,
            lapses: sourceState.lapses,
            learningSteps: sourceState.learningSteps,
            state: sourceState.state,
            reviewCount: sourceState.reviewCount,
            lapseCount: sourceState.lapseCount,
            consecutiveCorrect: sourceState.consecutiveCorrect,
            consecutiveWrong: sourceState.consecutiveWrong,
            lastRating: sourceState.lastRating,
            lastSource: sourceState.lastSource
          },
          $setOnInsert: {
            userId,
            wordId: word._id,
            listId: membership.listId
          }
        },
        { upsert: true, new: true }
      );

      return mirroredState;
    })
  );
};

export const ensureLearningState = async (
  userId: string,
  listId: string,
  word: Pick<IWord, '_id' | 'listMemberships'>
) => {
  let state = await LearningState.findOne({ userId, listId, wordId: word._id });
  if (state) {
    return state;
  }

  const existingState = await LearningState.findOne({ userId, wordId: word._id }).sort({ updatedAt: -1 });
  if (existingState) {
    state = await LearningState.create({
      userId,
      wordId: word._id,
      listId: new mongoose.Types.ObjectId(listId),
      dueAt: existingState.dueAt,
      lastReviewedAt: existingState.lastReviewedAt,
      stability: existingState.stability,
      difficulty: existingState.difficulty,
      scheduledDays: existingState.scheduledDays,
      elapsedDays: existingState.elapsedDays,
      reps: existingState.reps,
      lapses: existingState.lapses,
      learningSteps: existingState.learningSteps,
      state: existingState.state,
      reviewCount: existingState.reviewCount,
      lapseCount: existingState.lapseCount,
      consecutiveCorrect: existingState.consecutiveCorrect,
      consecutiveWrong: existingState.consecutiveWrong,
      lastRating: existingState.lastRating,
      lastSource: existingState.lastSource
    });
    return state;
  }

  const now = new Date();
  const seededCard = createEmptyCard(now);
  state = await LearningState.create({
    userId,
    wordId: word._id,
    listId: new mongoose.Types.ObjectId(listId),
    dueAt: seededCard.due,
    stability: seededCard.stability,
    difficulty: seededCard.difficulty,
    scheduledDays: seededCard.scheduled_days,
    elapsedDays: seededCard.elapsed_days,
    reps: seededCard.reps,
    lapses: seededCard.lapses,
    learningSteps: seededCard.learning_steps,
    state: seededCard.state,
    reviewCount: 0,
    lapseCount: 0,
    consecutiveCorrect: 0,
    consecutiveWrong: 0
  });

  return state;
};

export const scheduleWordsForList = async (
  userId: string,
  list: Pick<IWordList, '_id' | 'kind' | 'systemKey'>,
  words: Array<Pick<IWord, '_id' | 'value' | 'listMemberships'>>,
  count: number,
  options?: { poolSize?: number }
) => {
  const now = new Date();
  const [{ behaviorMap }, states] = await Promise.all([
    buildWordReviewBehaviorMap(userId, list._id.toString()),
    Promise.all(words.map((word) => ensureLearningState(userId, list._id.toString(), word)))
  ]);
  const scheduled = words.map((word, index) => {
    const state = states[index];
    const membership = getMembership(word, list._id.toString());
    const retrievability = scheduler.get_retrievability(cardFromState(state), now, false);
    const behaviorStats = behaviorMap.get(word._id.toString()) || emptyReviewBehaviorStats();
    const challengeScore = computeWordChallengeScore(state, retrievability, behaviorStats);
    const urgency = computeUrgency(state, retrievability, now, behaviorStats);

    return {
      id: word._id.toString(),
      value: word.value,
      meaning: membership?.meaning || '',
      state: {
        dueAt: state.dueAt.toISOString(),
        lastReviewedAt: state.lastReviewedAt?.toISOString(),
        stability: state.stability,
        difficulty: state.difficulty,
        reviewCount: state.reviewCount,
        lapseCount: state.lapseCount,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveWrong: state.consecutiveWrong,
        retrievability,
        status: stateNameMap[state.state],
        urgency,
        challengeScore,
        behaviorRisk: behaviorStats.behaviorRisk,
        hintUsageRate: behaviorStats.hintUsageRate,
        averageResponseTimeMs: behaviorStats.averageResponseTimeMs
      }
    };
  });

  const prioritized = scheduled.sort((a, b) => b.state.urgency - a.state.urgency);
  const poolSize = options?.poolSize ?? count;
  const pool = prioritized.slice(0, Math.max(count, poolSize));

  if (isMistakeBookList(list)) {
    return pool.slice(0, count);
  }

  return pool;
};

const buildScheduledWordState = (
  state: Pick<
    ILearningState,
    | 'dueAt'
    | 'lastReviewedAt'
    | 'stability'
    | 'difficulty'
    | 'reviewCount'
    | 'lapseCount'
    | 'consecutiveCorrect'
    | 'consecutiveWrong'
    | 'elapsedDays'
    | 'scheduledDays'
    | 'learningSteps'
    | 'reps'
    | 'lapses'
    | 'state'
  >,
  now: Date,
  behaviorStats: ReviewBehaviorStats
) => {
  const retrievability = scheduler.get_retrievability(cardFromState(state), now, false);
  const challengeScore = computeWordChallengeScore(state as ILearningState, retrievability, behaviorStats);
  const urgency = computeUrgency(state as ILearningState, retrievability, now, behaviorStats);

  return {
    dueAt: state.dueAt.toISOString(),
    lastReviewedAt: state.lastReviewedAt?.toISOString(),
    stability: state.stability,
    difficulty: state.difficulty,
    reviewCount: state.reviewCount,
    lapseCount: state.lapseCount,
    consecutiveCorrect: state.consecutiveCorrect,
    consecutiveWrong: state.consecutiveWrong,
    retrievability,
    status: stateNameMap[state.state],
    urgency,
    challengeScore,
    behaviorRisk: behaviorStats.behaviorRisk,
    hintUsageRate: behaviorStats.hintUsageRate,
    averageResponseTimeMs: behaviorStats.averageResponseTimeMs
  };
};

const pickPreferredDueReviewSource = (
  word: Pick<IWord, '_id' | 'value' | 'listMemberships'>,
  candidateListIds: string[],
  listsById: Map<string, Pick<IWordList, '_id' | 'name' | 'kind' | 'systemKey'>>
) => {
  const membershipListIds = word.listMemberships
    .map((membership) => membership.listId.toString())
    .filter((listId) => !isDueReviewList(listsById.get(listId)));
  const eligibleListIds = Array.from(new Set(
    candidateListIds.filter((listId) => membershipListIds.includes(listId))
  ));

  const preferredCustomListId = eligibleListIds.find((listId) => listsById.get(listId)?.kind === 'custom');
  const preferredMistakeListId = eligibleListIds.find((listId) => isMistakeBookList(listsById.get(listId)));
  const fallbackMembershipListId = membershipListIds.find((listId) => listsById.has(listId));
  const sourceListId = preferredCustomListId || preferredMistakeListId || eligibleListIds[0] || fallbackMembershipListId;

  if (!sourceListId) {
    return null;
  }

  const sourceMembership = getMembership(word, sourceListId);
  if (!sourceMembership) {
    return null;
  }

  const sourceListIds = Array.from(new Set(
    eligibleListIds.filter((listId) => listsById.has(listId))
  ));
  const sourceListNames = sourceListIds
    .map((listId) => listsById.get(listId)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    meaning: sourceMembership.meaning,
    sourceListId,
    sourceListIds,
    sourceListName: listsById.get(sourceListId)?.name,
    sourceListNames
  };
};

export const selectDueReviewWords = async (
  userId: string,
  count: number,
  poolSize?: number,
  excludedWordIds: string[] = []
): Promise<ScheduledWord[]> => {
  const now = new Date();
  const cutoff = getDueReviewCutoff(now);
  const dueStates = await LearningState.find({
    userId,
    dueAt: { $lte: cutoff },
    reviewCount: { $gt: 0 }
  })
    .sort({ dueAt: 1, updatedAt: -1 })
    .lean();

  if (!dueStates.length) {
    return [] as ScheduledWord[];
  }

  const [lists, words, { behaviorMap }] = await Promise.all([
    WordList.find({ _id: { $in: Array.from(new Set(dueStates.map((state) => state.listId.toString()))) } })
      .select('_id name kind systemKey')
      .lean(),
    Word.find({ _id: { $in: Array.from(new Set(dueStates.map((state) => state.wordId.toString()))) } }).lean(),
    buildWordReviewBehaviorMap(userId)
  ]);
  const typedLists = lists as Array<Pick<IWordList, '_id' | 'name' | 'kind' | 'systemKey'>>;
  const typedWords = words as Array<Pick<IWord, '_id' | 'value' | 'listMemberships'>>;

  const listsById = new Map<string, Pick<IWordList, '_id' | 'name' | 'kind' | 'systemKey'>>(
    typedLists.map((list) => [list._id.toString(), list])
  );
  const dueStatesByWordId = new Map<string, Array<(typeof dueStates)[number]>>();

  for (const state of dueStates) {
    const listId = state.listId.toString();
    if (isDueReviewList(listsById.get(listId))) {
      continue;
    }

    const wordId = state.wordId.toString();
    const existingStates = dueStatesByWordId.get(wordId) || [];
    existingStates.push(state);
    dueStatesByWordId.set(wordId, existingStates);
  }

  const excludedWordIdSet = new Set(excludedWordIds);
  const scheduled = typedWords.flatMap((word) => {
    if (excludedWordIdSet.has(word._id.toString())) {
      return [];
    }

    const candidateStates = dueStatesByWordId.get(word._id.toString()) || [];
    if (!candidateStates.length) {
      return [];
    }

    const source = pickPreferredDueReviewSource(
      word,
      candidateStates.map((state) => state.listId.toString()),
      listsById
    );
    if (!source) {
      return [];
    }

    const sourceState = candidateStates.find((state) => state.listId.toString() === source.sourceListId) || candidateStates[0];
    const behaviorStats = behaviorMap.get(word._id.toString()) || emptyReviewBehaviorStats();

    return [{
      id: word._id.toString(),
      value: word.value,
      meaning: source.meaning,
      sourceListId: source.sourceListId,
      sourceListIds: source.sourceListIds,
      sourceListName: source.sourceListName,
      sourceListNames: source.sourceListNames,
      state: buildScheduledWordState(sourceState, now, behaviorStats)
    }];
  });

  const prioritized = scheduled.sort((a: ScheduledWord, b: ScheduledWord) => (
    b.state.urgency - a.state.urgency ||
    new Date(a.state.dueAt).getTime() - new Date(b.state.dueAt).getTime()
  ));
  const resolvedPoolSize = poolSize ?? count;
  return prioritized.slice(0, Math.max(count, resolvedPoolSize));
};

export const settleReviewResults = async (
  userId: string,
  list: Pick<IWordList, '_id' | 'kind' | 'systemKey'>,
  source: ReviewSource,
  results: ReviewSubmission[]
) => {
  const now = new Date();
  const normalizedResults = normalizeReviewResults(results);

  await Promise.all(normalizedResults.map(async (result) => {
    const word = await Word.findById(result.wordId);
    if (!word) {
      return;
    }

    const membership = getMembership(word, list._id.toString());
    if (!membership) {
      return;
    }

    const state = await ensureLearningState(userId, list._id.toString(), word);
    const next = scheduler.next(cardFromState(state), now, ratingMap[result.rating]);

    copyLearningMetrics(state, {
      dueAt: next.card.due,
      lastReviewedAt: next.card.last_review,
      stability: next.card.stability,
      difficulty: next.card.difficulty,
      scheduledDays: next.card.scheduled_days,
      elapsedDays: next.card.elapsed_days,
      reps: next.card.reps,
      lapses: next.card.lapses,
      learningSteps: next.card.learning_steps,
      state: next.card.state,
      reviewCount: state.reviewCount,
      lapseCount: state.lapseCount,
      consecutiveCorrect: state.consecutiveCorrect,
      consecutiveWrong: state.consecutiveWrong,
      lastRating: state.lastRating,
      lastSource: state.lastSource
    });
    state.reviewCount += 1;
    state.lapseCount += result.correct ? 0 : 1;
    state.consecutiveCorrect = result.correct ? state.consecutiveCorrect + 1 : 0;
    state.consecutiveWrong = result.correct ? 0 : state.consecutiveWrong + 1;
    state.lastRating = result.rating;
    state.lastSource = source;

    await Promise.all([
      state.save(),
      ReviewLog.create({
        userId,
        wordId: word._id,
        listId: list._id,
        source,
        questionType: result.questionType,
        rating: result.rating,
        correct: result.correct,
        responseTimeMs: result.responseTimeMs,
        usedHint: result.usedHint,
        answeredAt: now
      })
    ]);

    await syncLearningStateAcrossMemberships(userId, word, state);
  }));
};

export const settleDueReviewResults = async (
  userId: string,
  source: ReviewSource,
  results: ReviewSubmission[]
) => {
  const normalizedResults = normalizeReviewResults(results);
  if (!normalizedResults.length) {
    return;
  }

  const sourceListIds = Array.from(new Set(
    normalizedResults
      .map((result) => result.sourceListId)
      .filter((listId): listId is string => Boolean(listId))
  ));

  if (!sourceListIds.length) {
    return;
  }

  const lists = (await WordList.find({ _id: { $in: sourceListIds } }).lean()) as Array<Pick<IWordList, '_id' | 'kind' | 'systemKey'>>;
  const listsById = new Map<string, Pick<IWordList, '_id' | 'kind' | 'systemKey'>>(
    lists.map((list) => [list._id.toString(), list])
  );
  const groupedResults = new Map<string, ExpandedReviewSubmission[]>();

  for (const result of normalizedResults) {
    if (!result.sourceListId || !listsById.has(result.sourceListId)) {
      continue;
    }

    const currentResults = groupedResults.get(result.sourceListId) || [];
    currentResults.push(result);
    groupedResults.set(result.sourceListId, currentResults);
  }

  await Promise.all(Array.from(groupedResults.entries()).map(async ([sourceListId, grouped]) => {
    const list = listsById.get(sourceListId);
    if (!list) {
      return;
    }

    await settleReviewResults(userId, list, source, grouped);
  }));
};

export const summarizeListProgress = async (userId: string, listId: string) => {
  const [states, recentLogs] = await Promise.all([
    LearningState.find({ userId, listId }).lean(),
    ReviewLog.find({ userId, listId }).sort({ answeredAt: -1 }).limit(RECENT_LOG_LIMIT).lean()
  ]);
  const now = new Date();

  let dueCount = 0;
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let retentionAccumulator = 0;

  for (const state of states) {
    const retrievability = scheduler.get_retrievability(cardFromState({
      dueAt: state.dueAt,
      stability: state.stability,
      difficulty: state.difficulty,
      elapsedDays: state.elapsedDays,
      scheduledDays: state.scheduledDays,
      learningSteps: state.learningSteps,
      reps: state.reps,
      lapses: state.lapses,
      state: state.state,
      lastReviewedAt: state.lastReviewedAt
    }), now, false);
    retentionAccumulator += retrievability;

    if (hasStartedReviewFlow(state) && state.dueAt <= now) {
      dueCount += 1;
    }

    if (state.reviewCount === 0 || state.state === State.New) {
      newCount += 1;
    } else if (state.state === State.Learning || state.state === State.Relearning) {
      learningCount += 1;
    } else {
      reviewCount += 1;
    }

    if (state.state === State.Review && retrievability >= 0.9 && state.consecutiveWrong === 0) {
      masteredCount += 1;
    }
  }

  const reviewStats = buildReviewBehaviorStats(recentLogs);

  return {
    dueCount,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    retentionScore: states.length ? Math.round((retentionAccumulator / states.length) * 100) : 0,
    recentReviewCount: reviewStats.recentReviewCount,
    averageResponseTimeMs: reviewStats.averageResponseTimeMs,
    hintUsageRate: Math.round(reviewStats.hintUsageRate * 100),
    hardRate: Math.round(reviewStats.hardRate * 100),
    againRate: Math.round(reviewStats.againRate * 100)
  };
};

export const summarizeDueReviewProgress = async (userId: string) => {
  const dueWords = await selectDueReviewWords(userId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let retentionAccumulator = 0;
  const sourceListIds = new Set<string>();

  for (const word of dueWords) {
    retentionAccumulator += word.state.retrievability;

    if (word.state.status === 'new') {
      newCount += 1;
    } else if (word.state.status === 'learning' || word.state.status === 'relearning') {
      learningCount += 1;
    } else {
      reviewCount += 1;
    }

    if (
      word.state.status === 'review' &&
      word.state.retrievability >= 0.9 &&
      word.state.consecutiveWrong === 0
    ) {
      masteredCount += 1;
    }

    for (const listId of word.sourceListIds || []) {
      sourceListIds.add(listId);
    }
  }

  return {
    wordCount: dueWords.length,
    dueCount: dueWords.length,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    sourceListCount: sourceListIds.size,
    retentionScore: dueWords.length ? Math.round((retentionAccumulator / dueWords.length) * 100) : 0
  };
};

export const seedLearningStateFromLegacyPoint = async (
  userId: string,
  wordId: mongoose.Types.ObjectId,
  listId: mongoose.Types.ObjectId,
  learnedPoint: number
) => {
  const existing = await LearningState.findOne({ userId, wordId, listId });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const seededCard = buildInitialCardFromLegacyPoint(learnedPoint, now);

  return LearningState.create({
    userId,
    wordId,
    listId,
    dueAt: seededCard.due,
    lastReviewedAt: seededCard.last_review,
    stability: seededCard.stability,
    difficulty: seededCard.difficulty,
    scheduledDays: seededCard.scheduled_days,
    elapsedDays: seededCard.elapsed_days,
    reps: seededCard.reps,
    lapses: seededCard.lapses,
    learningSteps: seededCard.learning_steps,
    state: seededCard.state,
    reviewCount: seededCard.reps,
    lapseCount: seededCard.lapses,
    consecutiveCorrect: learnedPoint >= 60 ? 2 : learnedPoint >= 20 ? 1 : 0,
    consecutiveWrong: learnedPoint <= 20 ? 1 : 0,
    lastRating: learnedPoint >= 80 ? 'easy' : learnedPoint >= 40 ? 'good' : 'hard',
    lastSource: 'learn'
  });
};
