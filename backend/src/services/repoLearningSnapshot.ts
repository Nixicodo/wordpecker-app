import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { UserPreferences } from '../api/preferences/model';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';

type SnapshotWordList = {
  id: string;
  name: string;
  description?: string;
  context?: string;
  kind: 'custom' | 'mistake_book';
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
  answeredAt: string;
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
    preferences: SnapshotUserPreference[];
  };
};

const snapshotPath = path.resolve(process.cwd(), 'data', 'learning-snapshot.json');

const ensureSnapshotDirectory = async () => {
  await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
};

const serializeDate = (value?: Date | string | null) =>
  value ? new Date(value).toISOString() : undefined;

const serializeDateOrEpoch = (value?: Date | string | null) =>
  value ? new Date(value).toISOString() : new Date(0).toISOString();

export const persistLearningSnapshot = async () => {
  const [lists, words, learningStates, reviewLogs, preferences] = await Promise.all([
    WordList.find().sort({ created_at: 1 }).lean(),
    Word.find().sort({ created_at: 1 }).lean(),
    LearningState.find().sort({ createdAt: 1 }).lean(),
    ReviewLog.find().sort({ answeredAt: 1 }).lean(),
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
        answeredAt: serializeDateOrEpoch(log.answeredAt),
        createdAt: serializeDateOrEpoch(log.createdAt),
        updatedAt: serializeDateOrEpoch(log.updatedAt)
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

const databaseHasLearningData = async () => {
  const [listCount, wordCount, preferenceCount, learningStateCount, reviewLogCount] = await Promise.all([
    WordList.countDocuments(),
    Word.countDocuments(),
    UserPreferences.countDocuments(),
    LearningState.countDocuments(),
    ReviewLog.countDocuments()
  ]);

  return listCount > 0 || wordCount > 0 || preferenceCount > 0 || learningStateCount > 0 || reviewLogCount > 0;
};

export const restoreLearningSnapshotIfNeeded = async () => {
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

  const { lists, words, learningStates, reviewLogs, preferences } = snapshot.data;

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
      answeredAt: new Date(log.answeredAt),
      createdAt: new Date(log.createdAt),
      updatedAt: new Date(log.updatedAt)
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

export const getLearningSnapshotPath = () => snapshotPath;
