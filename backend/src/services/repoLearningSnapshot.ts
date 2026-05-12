import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { UserPreferences } from '../api/preferences/model';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import { DueReviewProgress } from '../api/due-review-progress/model';
import { environment } from '../config/environment';

type SnapshotWordList = {
  id: string;
  name: string;
  description?: string;
  context?: string;
  kind: 'custom' | 'mistake_book' | 'due_review';
  systemKey?: string;
  created_at: string;
  updated_at: string;
};

type SnapshotWord = {
  id: string;
  value: string;
      listMemberships: Array<{
        listId: string;
        meaning: string;
        phonetic?: string;
        detailedExplanation?: string;
        detailedExplanationGeneratedAt?: string;
        sourceListIds?: string[];
        tags?: string[];
        addedAt?: string;
        updatedAt?: string;
  }>;
  created_at: string;
  updated_at: string;
};

type SnapshotLearningState = {
  userId: string;
  wordId: string;
  listId: string;
  dueAt: string;
  lastReviewedAt?: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  lastRating?: string;
  lastSource?: string;
  createdAt: string;
  updatedAt: string;
};

type SnapshotReviewLog = {
  userId: string;
  wordId: string;
  listId: string;
  source: string;
  questionType: string;
  rating: string;
  correct: boolean;
  responseTimeMs?: number;
  usedHint?: boolean;
  settlementKey?: string;
  answeredAt: string;
  stateBefore?: {
    dueAt: string;
    lastReviewedAt?: string;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    elapsedDays: number;
    reps: number;
    lapses: number;
    learningSteps: number;
    state: number;
    reviewCount: number;
    lapseCount: number;
    consecutiveCorrect: number;
    consecutiveWrong: number;
    lastRating?: string;
    lastSource?: string;
  };
  createdAt: string;
  updatedAt: string;
};

type SnapshotDueReviewModeProgress = {
  completed: boolean;
  hadError: boolean;
  rating?: string;
  responseTimeMs?: number;
  usedHint?: boolean;
  questionType?: string;
  answeredAt?: string;
  selfAssessedWordIds: string[];
};

type SnapshotDueReviewProgress = {
  userId: string;
  wordId: string;
  sourceListId: string;
  cycleKey: string;
  meaningToWord: SnapshotDueReviewModeProgress;
  wordToMeaning: SnapshotDueReviewModeProgress;
  settledAt?: string;
  settledCorrect?: boolean;
  settledRating?: string;
  createdAt: string;
  updatedAt: string;
};

type SnapshotUserPreference = {
  userId: string;
  exerciseTypes: Record<string, boolean>;
  baseLanguage: string;
  targetLanguage: string;
  createdAt: string;
  updatedAt: string;
};

type LearningSnapshot = {
  version: 2;
  exportedAt: string;
  data: {
    lists: SnapshotWordList[];
    words: SnapshotWord[];
    learningStates: SnapshotLearningState[];
    reviewLogs: SnapshotReviewLog[];
    dueReviewProgresses: SnapshotDueReviewProgress[];
    preferences: SnapshotUserPreference[];
  };
};

const resolveSnapshotPath = () =>
  process.env.LEARNING_SNAPSHOT_PATH
    ? path.resolve(process.env.LEARNING_SNAPSHOT_PATH)
    : path.resolve(process.cwd(), 'data', 'learning-snapshot.json');

const ensureSnapshotDirectory = async () => {
  const snapshotPath = resolveSnapshotPath();
  await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
};

let snapshotPersistRequested = false;
let snapshotPersistWorker: Promise<void> | null = null;

const serializeDate = (value?: Date | string | null) =>
  value ? new Date(value).toISOString() : undefined;

const serializeDateOrEpoch = (value?: Date | string | null) =>
  value ? new Date(value).toISOString() : new Date(0).toISOString();

export const persistLearningSnapshot = async () => {
  if (environment.nodeEnv === 'development' && process.env.ENABLE_DEV_SNAPSHOT_PERSIST === 'false') {
    return;
  }

  const snapshotPath = resolveSnapshotPath();
  const [lists, words, learningStates, reviewLogs, dueReviewProgresses, preferences] = await Promise.all([
    WordList.find().sort({ created_at: 1 }).lean(),
    Word.find().sort({ created_at: 1 }).lean(),
    LearningState.find().sort({ createdAt: 1 }).lean(),
    ReviewLog.find().sort({ answeredAt: 1 }).lean(),
    DueReviewProgress.find().sort({ updatedAt: 1 }).lean(),
    UserPreferences.find().sort({ createdAt: 1 }).lean()
  ]);

  const snapshot: LearningSnapshot = {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      lists: lists.map((list: any) => ({
        id: list._id.toString(),
        name: list.name,
        description: list.description,
        context: list.context,
        kind: list.kind,
        systemKey: list.systemKey,
        created_at: serializeDateOrEpoch(list.created_at),
        updated_at: serializeDateOrEpoch(list.updated_at)
      })),
      words: words.map((word: any) => ({
        id: word._id.toString(),
        value: word.value,
        listMemberships: (word.listMemberships || []).map((membership: any) => ({
          listId: membership.listId.toString(),
          meaning: membership.meaning,
          phonetic: membership.phonetic,
          detailedExplanation: membership.detailedExplanation,
          detailedExplanationGeneratedAt: serializeDate(membership.detailedExplanationGeneratedAt),
          sourceListIds: membership.sourceListIds?.map((sourceId: any) => sourceId.toString()),
          tags: membership.tags,
          addedAt: serializeDate(membership.addedAt),
          updatedAt: serializeDate(membership.updatedAt)
        })),
        created_at: serializeDateOrEpoch(word.created_at),
        updated_at: serializeDateOrEpoch(word.updated_at)
      })),
      learningStates: learningStates.map((state: any) => ({
        userId: state.userId,
        wordId: state.wordId.toString(),
        listId: state.listId.toString(),
        dueAt: serializeDateOrEpoch(state.dueAt),
        lastReviewedAt: serializeDate(state.lastReviewedAt),
        stability: state.stability,
        difficulty: state.difficulty,
        scheduledDays: state.scheduledDays,
        elapsedDays: state.elapsedDays,
        reps: state.reps,
        lapses: state.lapses,
        learningSteps: state.learningSteps,
        state: state.state,
        reviewCount: state.reviewCount,
        lapseCount: state.lapseCount,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveWrong: state.consecutiveWrong,
        lastRating: state.lastRating,
        lastSource: state.lastSource,
        createdAt: serializeDateOrEpoch(state.createdAt),
        updatedAt: serializeDateOrEpoch(state.updatedAt)
      })),
      reviewLogs: reviewLogs.map((log: any) => ({
        userId: log.userId,
        wordId: log.wordId.toString(),
        listId: log.listId.toString(),
        source: log.source,
        questionType: log.questionType,
        rating: log.rating,
        correct: log.correct,
        responseTimeMs: log.responseTimeMs,
        usedHint: log.usedHint,
        settlementKey: log.settlementKey,
        answeredAt: serializeDateOrEpoch(log.answeredAt),
        createdAt: serializeDateOrEpoch(log.createdAt),
        updatedAt: serializeDateOrEpoch(log.updatedAt)
      })),
      dueReviewProgresses: dueReviewProgresses.map((progress: any) => ({
        userId: progress.userId,
        wordId: progress.wordId.toString(),
        sourceListId: progress.sourceListId.toString(),
        cycleKey: progress.cycleKey,
        meaningToWord: {
          completed: Boolean(progress.meaningToWord?.completed),
          hadError: Boolean(progress.meaningToWord?.hadError),
          rating: progress.meaningToWord?.rating,
          responseTimeMs: progress.meaningToWord?.responseTimeMs,
          usedHint: progress.meaningToWord?.usedHint,
          questionType: progress.meaningToWord?.questionType,
          answeredAt: serializeDate(progress.meaningToWord?.answeredAt),
          selfAssessedWordIds: (progress.meaningToWord?.selfAssessedWordIds || []).map((wordId: any) => wordId.toString())
        },
        wordToMeaning: {
          completed: Boolean(progress.wordToMeaning?.completed),
          hadError: Boolean(progress.wordToMeaning?.hadError),
          rating: progress.wordToMeaning?.rating,
          responseTimeMs: progress.wordToMeaning?.responseTimeMs,
          usedHint: progress.wordToMeaning?.usedHint,
          questionType: progress.wordToMeaning?.questionType,
          answeredAt: serializeDate(progress.wordToMeaning?.answeredAt),
          selfAssessedWordIds: (progress.wordToMeaning?.selfAssessedWordIds || []).map((wordId: any) => wordId.toString())
        },
        settledAt: serializeDate(progress.settledAt),
        settledCorrect: progress.settledCorrect,
        settledRating: progress.settledRating,
        createdAt: serializeDateOrEpoch(progress.createdAt),
        updatedAt: serializeDateOrEpoch(progress.updatedAt)
      })),
      preferences: preferences.map((preference: any) => ({
        userId: preference.userId,
        exerciseTypes: preference.exerciseTypes,
        baseLanguage: preference.baseLanguage,
        targetLanguage: preference.targetLanguage,
        createdAt: serializeDateOrEpoch(preference.createdAt),
        updatedAt: serializeDateOrEpoch(preference.updatedAt)
      }))
    }
  };

  await ensureSnapshotDirectory();
  const tempPath = `${snapshotPath}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  await fs.promises.rename(tempPath, snapshotPath);
};

const runQueuedSnapshotPersists = async () => {
  do {
    snapshotPersistRequested = false;

    try {
      await persistLearningSnapshot();
    } catch (error) {
      console.error('Failed to persist learning snapshot in background:', error);
    }
  } while (snapshotPersistRequested);

  snapshotPersistWorker = null;
};

export const requestLearningSnapshotPersist = async () => {
  if (process.env.NODE_ENV === 'test') {
    await persistLearningSnapshot();
    return;
  }

  snapshotPersistRequested = true;

  if (!snapshotPersistWorker) {
    snapshotPersistWorker = runQueuedSnapshotPersists();
  }
};

export const waitForRequestedLearningSnapshotPersist = async () => {
  while (snapshotPersistWorker) {
    await snapshotPersistWorker;
  }
};

const databaseHasLearningData = async () => {
  const [listCount, wordCount, preferenceCount, learningStateCount, reviewLogCount, dueReviewProgressCount] = await Promise.all([
    WordList.countDocuments(),
    Word.countDocuments(),
    UserPreferences.countDocuments(),
    LearningState.countDocuments(),
    ReviewLog.countDocuments(),
    DueReviewProgress.countDocuments()
  ]);

  return listCount > 0 || wordCount > 0 || preferenceCount > 0 || learningStateCount > 0 || reviewLogCount > 0 || dueReviewProgressCount > 0;
};

export const restoreLearningSnapshotIfNeeded = async () => {
  const snapshotPath = resolveSnapshotPath();
  if (!fs.existsSync(snapshotPath)) {
    return false;
  }

  if (await databaseHasLearningData()) {
    return false;
  }

  const rawSnapshot = await fs.promises.readFile(snapshotPath, 'utf-8');
  const snapshot = JSON.parse(rawSnapshot) as LearningSnapshot;

  if (snapshot.version !== 2) {
    return false;
  }

  const { lists, words, learningStates, reviewLogs, dueReviewProgresses, preferences } = snapshot.data;

  if (lists.length > 0) {
    await WordList.insertMany(lists.map((list) => ({
      _id: new mongoose.Types.ObjectId(list.id),
      name: list.name,
      description: list.description,
      context: list.context,
      kind: list.kind,
      systemKey: list.systemKey,
      created_at: new Date(list.created_at),
      updated_at: new Date(list.updated_at)
    })));
  }

  if (words.length > 0) {
    await Word.insertMany(words.map((word) => ({
      _id: new mongoose.Types.ObjectId(word.id),
      value: word.value,
      listMemberships: word.listMemberships.map((membership) => ({
        listId: new mongoose.Types.ObjectId(membership.listId),
        meaning: membership.meaning,
        phonetic: membership.phonetic,
        detailedExplanation: membership.detailedExplanation,
        detailedExplanationGeneratedAt: membership.detailedExplanationGeneratedAt
          ? new Date(membership.detailedExplanationGeneratedAt)
          : undefined,
        sourceListIds: membership.sourceListIds?.map((sourceId) => new mongoose.Types.ObjectId(sourceId)),
        tags: membership.tags,
        addedAt: membership.addedAt ? new Date(membership.addedAt) : undefined,
        updatedAt: membership.updatedAt ? new Date(membership.updatedAt) : undefined
      })),
      created_at: new Date(word.created_at),
      updated_at: new Date(word.updated_at)
    })));
  }

  if (learningStates.length > 0) {
    await LearningState.insertMany(learningStates.map((state) => ({
      userId: state.userId,
      wordId: new mongoose.Types.ObjectId(state.wordId),
      listId: new mongoose.Types.ObjectId(state.listId),
      dueAt: new Date(state.dueAt),
      lastReviewedAt: state.lastReviewedAt ? new Date(state.lastReviewedAt) : undefined,
      stability: state.stability,
      difficulty: state.difficulty,
      scheduledDays: state.scheduledDays,
      elapsedDays: state.elapsedDays,
      reps: state.reps,
      lapses: state.lapses,
      learningSteps: state.learningSteps,
      state: state.state,
      reviewCount: state.reviewCount,
      lapseCount: state.lapseCount,
      consecutiveCorrect: state.consecutiveCorrect,
      consecutiveWrong: state.consecutiveWrong,
      lastRating: state.lastRating,
      lastSource: state.lastSource,
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt)
    })));
  }

  if (reviewLogs.length > 0) {
    await ReviewLog.insertMany(reviewLogs.map((log) => ({
      userId: log.userId,
      wordId: new mongoose.Types.ObjectId(log.wordId),
      listId: new mongoose.Types.ObjectId(log.listId),
      source: log.source,
      questionType: log.questionType,
      rating: log.rating,
      correct: log.correct,
      responseTimeMs: log.responseTimeMs,
      usedHint: log.usedHint,
      settlementKey: log.settlementKey,
      answeredAt: new Date(log.answeredAt),
      stateBefore: log.stateBefore ? {
        dueAt: new Date(log.stateBefore.dueAt),
        lastReviewedAt: log.stateBefore.lastReviewedAt ? new Date(log.stateBefore.lastReviewedAt) : undefined,
        stability: log.stateBefore.stability,
        difficulty: log.stateBefore.difficulty,
        scheduledDays: log.stateBefore.scheduledDays,
        elapsedDays: log.stateBefore.elapsedDays,
        reps: log.stateBefore.reps,
        lapses: log.stateBefore.lapses,
        learningSteps: log.stateBefore.learningSteps,
        state: log.stateBefore.state,
        reviewCount: log.stateBefore.reviewCount,
        lapseCount: log.stateBefore.lapseCount,
        consecutiveCorrect: log.stateBefore.consecutiveCorrect,
        consecutiveWrong: log.stateBefore.consecutiveWrong,
        lastRating: log.stateBefore.lastRating,
        lastSource: log.stateBefore.lastSource
      } : undefined,
      createdAt: new Date(log.createdAt),
      updatedAt: new Date(log.updatedAt)
    })));
  }

  if (dueReviewProgresses.length > 0) {
    await DueReviewProgress.insertMany(dueReviewProgresses.map((progress) => ({
      userId: progress.userId,
      wordId: new mongoose.Types.ObjectId(progress.wordId),
      sourceListId: new mongoose.Types.ObjectId(progress.sourceListId),
      cycleKey: progress.cycleKey,
      meaningToWord: {
        completed: progress.meaningToWord.completed,
        hadError: progress.meaningToWord.hadError,
        rating: progress.meaningToWord.rating,
        responseTimeMs: progress.meaningToWord.responseTimeMs,
        usedHint: progress.meaningToWord.usedHint,
        questionType: progress.meaningToWord.questionType,
        answeredAt: progress.meaningToWord.answeredAt ? new Date(progress.meaningToWord.answeredAt) : undefined,
        selfAssessedWordIds: progress.meaningToWord.selfAssessedWordIds.map((wordId) => new mongoose.Types.ObjectId(wordId))
      },
      wordToMeaning: {
        completed: progress.wordToMeaning.completed,
        hadError: progress.wordToMeaning.hadError,
        rating: progress.wordToMeaning.rating,
        responseTimeMs: progress.wordToMeaning.responseTimeMs,
        usedHint: progress.wordToMeaning.usedHint,
        questionType: progress.wordToMeaning.questionType,
        answeredAt: progress.wordToMeaning.answeredAt ? new Date(progress.wordToMeaning.answeredAt) : undefined,
        selfAssessedWordIds: progress.wordToMeaning.selfAssessedWordIds.map((wordId) => new mongoose.Types.ObjectId(wordId))
      },
      settledAt: progress.settledAt ? new Date(progress.settledAt) : undefined,
      settledCorrect: progress.settledCorrect,
      settledRating: progress.settledRating,
      createdAt: new Date(progress.createdAt),
      updatedAt: new Date(progress.updatedAt)
    })));
  }

  if (preferences.length > 0) {
    await UserPreferences.insertMany(preferences.map((preference) => ({
      userId: preference.userId,
      exerciseTypes: preference.exerciseTypes,
      baseLanguage: preference.baseLanguage,
      targetLanguage: preference.targetLanguage,
      createdAt: new Date(preference.createdAt),
      updatedAt: new Date(preference.updatedAt)
    })));
  }

  return true;
};

export const getLearningSnapshotPath = () => resolveSnapshotPath();
