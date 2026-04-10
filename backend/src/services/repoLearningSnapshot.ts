import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { UserPreferences } from '../api/preferences/model';

type SnapshotWordList = {
  id: string;
  name: string;
  description?: string;
  context?: string;
  created_at: string;
  updated_at: string;
};

type SnapshotWord = {
  id: string;
  value: string;
  ownedByLists: Array<{
    listId: string;
    meaning: string;
    learnedPoint: number;
  }>;
  created_at: string;
  updated_at: string;
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
  version: 1;
  exportedAt: string;
  data: {
    lists: SnapshotWordList[];
    words: SnapshotWord[];
    preferences: SnapshotUserPreference[];
  };
};

const snapshotPath = path.resolve(process.cwd(), 'data', 'learning-snapshot.json');

const ensureSnapshotDirectory = async () => {
  await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
};

const serializeDate = (value?: Date | string | null) =>
  value ? new Date(value).toISOString() : new Date(0).toISOString();

export const persistLearningSnapshot = async () => {
  const [lists, words, preferences] = await Promise.all([
    WordList.find().sort({ created_at: 1 }).lean(),
    Word.find().sort({ created_at: 1 }).lean(),
    UserPreferences.find().sort({ createdAt: 1 }).lean()
  ]);

  const snapshot: LearningSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      lists: lists.map((list: any) => ({
        id: list._id.toString(),
        name: list.name,
        description: list.description,
        context: list.context,
        created_at: serializeDate(list.created_at),
        updated_at: serializeDate(list.updated_at)
      })),
      words: words.map((word: any) => ({
        id: word._id.toString(),
        value: word.value,
        ownedByLists: (word.ownedByLists || []).map((context: any) => ({
          listId: context.listId.toString(),
          meaning: context.meaning,
          learnedPoint: context.learnedPoint || 0
        })),
        created_at: serializeDate(word.created_at),
        updated_at: serializeDate(word.updated_at)
      })),
      preferences: preferences.map((preference: any) => ({
        userId: preference.userId,
        exerciseTypes: preference.exerciseTypes,
        baseLanguage: preference.baseLanguage,
        targetLanguage: preference.targetLanguage,
        createdAt: serializeDate(preference.createdAt),
        updatedAt: serializeDate(preference.updatedAt)
      }))
    }
  };

  await ensureSnapshotDirectory();
  const tempPath = `${snapshotPath}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  await fs.promises.rename(tempPath, snapshotPath);
};

const databaseHasLearningData = async () => {
  const [listCount, wordCount, preferenceCount] = await Promise.all([
    WordList.countDocuments(),
    Word.countDocuments(),
    UserPreferences.countDocuments()
  ]);

  return listCount > 0 || wordCount > 0 || preferenceCount > 0;
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

  if (snapshot.version !== 1) {
    throw new Error(`Unsupported learning snapshot version: ${snapshot.version}`);
  }

  const { lists, words, preferences } = snapshot.data;

  if (lists.length > 0) {
    await WordList.insertMany(lists.map((list) => ({
      _id: new mongoose.Types.ObjectId(list.id),
      name: list.name,
      description: list.description,
      context: list.context,
      created_at: new Date(list.created_at),
      updated_at: new Date(list.updated_at)
    })));
  }

  if (words.length > 0) {
    await Word.insertMany(words.map((word) => ({
      _id: new mongoose.Types.ObjectId(word.id),
      value: word.value,
      ownedByLists: word.ownedByLists.map((context) => ({
        listId: new mongoose.Types.ObjectId(context.listId),
        meaning: context.meaning,
        learnedPoint: context.learnedPoint
      })),
      created_at: new Date(word.created_at),
      updated_at: new Date(word.updated_at)
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
