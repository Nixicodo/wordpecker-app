import mongoose from 'mongoose';
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { LearningState, ReviewRating, ReviewSource, type ILearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import { IWord, Word } from '../api/words/model';
import { IWordList } from '../api/lists/model';
import { ensureMistakeBook, isMistakeBookList } from './mistakeBook';

const scheduler = fsrs({
  enable_fuzz: false,
  request_retention: 0.9
});

export type ReviewSubmission = {
  wordId: string;
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
  };
};

type InitialSeed = {
  rating: Grade;
  repeat: number;
};

const ratingMap: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy
};

const stateNameMap: Record<State, ScheduledWord['state']['status']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning'
};

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

const computeUrgency = (state: ILearningState, retrievability: number, now: Date) => {
  const overdueMs = Math.max(0, now.getTime() - state.dueAt.getTime());
  const overdueDays = overdueMs / (1000 * 60 * 60 * 24);
  const overdueBoost = Math.min(1, overdueDays / 7);
  const forgettingRisk = 1 - retrievability;
  const wrongBoost = Math.min(1, state.consecutiveWrong / 3);
  const lowExposureBoost = state.reviewCount === 0 ? 1 : Math.max(0, 1 - state.reviewCount / 8);
  const difficultyBoost = Math.min(1, state.difficulty / 10);

  return (
    forgettingRisk * 0.45 +
    overdueBoost * 0.2 +
    wrongBoost * 0.15 +
    lowExposureBoost * 0.1 +
    difficultyBoost * 0.1
  );
};

const getMembership = (word: Pick<IWord, '_id' | 'value' | 'listMemberships'>, listId: string) =>
  word.listMemberships.find((membership) => membership.listId.toString() === listId);

export const ensureLearningState = async (
  userId: string,
  listId: string,
  word: Pick<IWord, '_id' | 'listMemberships'>
) => {
  let state = await LearningState.findOne({ userId, listId, wordId: word._id });
  if (state) {
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
  const states = await Promise.all(words.map((word) => ensureLearningState(userId, list._id.toString(), word)));
  const scheduled = words.map((word, index) => {
    const state = states[index];
    const membership = getMembership(word, list._id.toString());
    const retrievability = scheduler.get_retrievability(cardFromState(state), now, false);
    const urgency = computeUrgency(state, retrievability, now);

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
        urgency
      }
    };
  });

  const prioritized = scheduled.sort((a, b) => b.state.urgency - a.state.urgency);
  const poolSize = options?.poolSize ?? count;
  const pool = prioritized.slice(0, Math.max(count, poolSize));

  if (isMistakeBookList(list)) {
    return pool.slice(0, count);
  }

  return pool.slice(0, count);
};

export const settleReviewResults = async (
  userId: string,
  list: Pick<IWordList, '_id' | 'kind' | 'systemKey'>,
  source: ReviewSource,
  results: ReviewSubmission[]
) => {
  const now = new Date();
  const isMistakeBook = isMistakeBookList(list);

  await Promise.all(results.map(async (result) => {
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

    state.dueAt = next.card.due;
    state.lastReviewedAt = next.card.last_review;
    state.stability = next.card.stability;
    state.difficulty = next.card.difficulty;
    state.scheduledDays = next.card.scheduled_days;
    state.elapsedDays = next.card.elapsed_days;
    state.reps = next.card.reps;
    state.lapses = next.card.lapses;
    state.learningSteps = next.card.learning_steps;
    state.state = next.card.state;
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

    if (!result.correct && !isMistakeBook) {
      await addWordToMistakeBook(userId, list._id.toString(), word);
    }
  }));
};

export const summarizeListProgress = async (userId: string, listId: string) => {
  const states = await LearningState.find({ userId, listId }).lean();
  const now = new Date();

  let dueCount = 0;
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let retentionAccumulator = 0;

  for (const state of states) {
    const retrievability = scheduler.get_retrievability(cardFromState(state as ILearningState), now, false);
    retentionAccumulator += retrievability;

    if (state.dueAt <= now) {
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

  return {
    dueCount,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    retentionScore: states.length ? Math.round((retentionAccumulator / states.length) * 100) : 0
  };
};

const addWordToMistakeBook = async (userId: string, sourceListId: string, word: IWord) => {
  const mistakeBook = await ensureMistakeBook();
  const sourceMembership = getMembership(word, sourceListId);
  if (!sourceMembership) {
    return;
  }

  const existingMembership = getMembership(word, mistakeBook._id.toString());
  if (!existingMembership) {
    word.listMemberships.push({
      listId: mistakeBook._id,
      meaning: sourceMembership.meaning,
      sourceListIds: [new mongoose.Types.ObjectId(sourceListId)],
      addedAt: new Date(),
      updatedAt: new Date()
    });
  } else {
    const sourceIds = new Set((existingMembership.sourceListIds || []).map((id) => id.toString()));
    if (!sourceIds.has(sourceListId)) {
      existingMembership.sourceListIds = [
        ...(existingMembership.sourceListIds || []),
        new mongoose.Types.ObjectId(sourceListId)
      ];
    }
    existingMembership.meaning = sourceMembership.meaning;
    existingMembership.updatedAt = new Date();
  }

  await word.save();

  const mistakeState = await ensureLearningState(userId, mistakeBook._id.toString(), word);
  mistakeState.dueAt = new Date();
  mistakeState.consecutiveWrong += 1;
  await mistakeState.save();
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
