import fs from 'fs';
import express from 'express';
import request from 'supertest';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { UserPreferences } from '../api/preferences/model';
import listRoutes from '../api/lists/routes';
import wordRoutes from '../api/words/routes';
import preferencesRoutes from '../api/preferences/routes';
import learnRoutes from '../api/learn/routes';
import quizRoutes from '../api/quiz/routes';
import {
  getLearningSnapshotPath,
  restoreLearningSnapshotIfNeeded
} from '../services/repoLearningSnapshot';

const emptySnapshot = {
  version: 1,
  exportedAt: '1970-01-01T00:00:00.000Z',
  data: {
    lists: [],
    words: [],
    preferences: []
  }
};

describe('repository learning snapshot integration', () => {
  const snapshotPath = getLearningSnapshotPath();
  const app = express();

  app.use(express.json());
  app.use('/api/lists', listRoutes);
  app.use('/api/lists', wordRoutes);
  app.use('/api/preferences', preferencesRoutes);
  app.use('/api/learn', learnRoutes);
  app.use('/api/quiz', quizRoutes);

  beforeAll(async () => {
    await connectDB(1, 100);
  });

  beforeEach(async () => {
    await Promise.all([
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);

    await fs.promises.writeFile(snapshotPath, JSON.stringify(emptySnapshot, null, 2) + '\n', 'utf-8');
  });

  afterAll(async () => {
    await Promise.all([
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);
    await fs.promises.writeFile(snapshotPath, JSON.stringify(emptySnapshot, null, 2) + '\n', 'utf-8');
    await closeDB();
  });

  it('persists repository snapshot after real API writes and restores it into an empty database', async () => {
    const preferencesResponse = await request(app)
      .get('/api/preferences')
      .set('user-id', 'snapshot-user');

    expect(preferencesResponse.status).toBe(200);
    expect(preferencesResponse.body.baseLanguage).toBe('en');

    const listResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '测试词单',
        description: '验证仓库快照',
        context: 'Testing snapshot persistence'
      });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.id as string;

    const addWordResponse = await request(app)
      .post(`/api/lists/${listId}/words`)
      .send({
        word: 'serendipity',
        meaning: '意外发现美好事物的运气'
      });

    expect(addWordResponse.status).toBe(201);
    const wordId = addWordResponse.body.id as string;

    const updatePointsResponse = await request(app)
      .put(`/api/quiz/${listId}/learned-points`)
      .send({
        results: [{ wordId, correct: true }]
      });

    expect(updatePointsResponse.status).toBe(200);

    const persistedSnapshot = JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'));
    expect(persistedSnapshot.data.lists).toHaveLength(1);
    expect(persistedSnapshot.data.words).toHaveLength(1);
    expect(persistedSnapshot.data.preferences).toHaveLength(1);
    expect(persistedSnapshot.data.words[0].ownedByLists[0].learnedPoint).toBe(10);

    await Promise.all([
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);

    const restored = await restoreLearningSnapshotIfNeeded();
    expect(restored).toBe(true);

    const restoredWord = await Word.findById(wordId).lean();
    expect(restoredWord?.ownedByLists[0].learnedPoint).toBe(10);

    const restoredList = await WordList.findById(listId).lean();
    expect(restoredList?.name).toBe('测试词单');

    const restoredPreferences = await UserPreferences.findOne({ userId: 'snapshot-user' }).lean();
    expect(restoredPreferences?.targetLanguage).toBe('en');
  });

  it('persists repository snapshot after learning session point settlement', async () => {
    const listResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '学习结算词树',
        description: '验证学习模式经验结算',
        context: 'Learning settlement'
      });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.id as string;

    const addWordResponse = await request(app)
      .post(`/api/lists/${listId}/words`)
      .send({
        word: 'aprender',
        meaning: '学习'
      });

    expect(addWordResponse.status).toBe(201);
    const wordId = addWordResponse.body.id as string;

    const updatePointsResponse = await request(app)
      .put(`/api/learn/${listId}/learned-points`)
      .send({
        results: [{ wordId, correct: true }]
      });

    expect(updatePointsResponse.status).toBe(200);

    const persistedSnapshot = JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'));
    expect(persistedSnapshot.data.words[0].ownedByLists[0].learnedPoint).toBe(10);
  });
});
