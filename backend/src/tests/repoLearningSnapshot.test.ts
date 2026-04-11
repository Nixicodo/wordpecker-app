import fs from 'fs';
import express from 'express';
import request from 'supertest';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { UserPreferences } from '../api/preferences/model';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
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
  version: 2,
  exportedAt: '1970-01-01T00:00:00.000Z',
  data: {
    lists: [],
    words: [],
    learningStates: [],
    reviewLogs: [],
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
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);

    await fs.promises.writeFile(snapshotPath, JSON.stringify(emptySnapshot, null, 2) + '\n', 'utf-8');
  });

  afterAll(async () => {
    await Promise.all([
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
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
      .set('user-id', 'snapshot-user')
      .send({
        word: 'serendipity',
        meaning: '意外发现美好事物的运气'
      });

    expect(addWordResponse.status).toBe(201);
    const wordId = addWordResponse.body.id as string;

    const updateReviewsResponse = await request(app)
      .put(`/api/quiz/${listId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: true, rating: 'good', questionType: 'multiple_choice' }]
      });

    expect(updateReviewsResponse.status).toBe(200);

    const persistedSnapshot = JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'));
    expect(persistedSnapshot.data.lists).toHaveLength(1);
    expect(persistedSnapshot.data.words).toHaveLength(1);
    expect(persistedSnapshot.data.preferences).toHaveLength(1);
    expect(persistedSnapshot.data.learningStates).toHaveLength(1);
    expect(persistedSnapshot.data.reviewLogs).toHaveLength(1);
    expect(persistedSnapshot.data.words[0].listMemberships[0].meaning).toBe('意外发现美好事物的运气');

    await Promise.all([
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);

    const restored = await restoreLearningSnapshotIfNeeded();
    expect(restored).toBe(true);

    const restoredWord = await Word.findById(wordId).lean();
    expect(restoredWord?.listMemberships[0].meaning).toBe('意外发现美好事物的运气');

    const restoredList = await WordList.findById(listId).lean();
    expect(restoredList?.name).toBe('测试词单');

    const restoredPreferences = await UserPreferences.findOne({ userId: 'snapshot-user' }).lean();
    expect(restoredPreferences?.targetLanguage).toBe('en');

    const restoredState = await LearningState.findOne({ userId: 'snapshot-user', wordId, listId }).lean();
    expect(restoredState?.reviewCount).toBe(1);
  });

  it('persists repository snapshot after learning session review settlement', async () => {
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
      .set('user-id', 'snapshot-user')
      .send({
        word: 'aprender',
        meaning: '学习'
      });

    expect(addWordResponse.status).toBe(201);
    const wordId = addWordResponse.body.id as string;

    const updateReviewsResponse = await request(app)
      .put(`/api/learn/${listId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: true, rating: 'good', questionType: 'fill_blank' }]
      });

    expect(updateReviewsResponse.status).toBe(200);

    const persistedSnapshot = JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'));
    expect(persistedSnapshot.data.learningStates[0].reviewCount).toBe(1);
    expect(persistedSnapshot.data.reviewLogs[0].rating).toBe('good');
  });

  it('creates and exposes the mistake book as a dedicated system list', async () => {
    const mistakeBookResponse = await request(app)
      .get('/api/lists/mistake-book')
      .set('user-id', 'snapshot-user');

    expect(mistakeBookResponse.status).toBe(200);
    expect(mistakeBookResponse.body.kind).toBe('mistake_book');
    expect(mistakeBookResponse.body.systemKey).toBe('mistake-book');

    const listsResponse = await request(app)
      .get('/api/lists')
      .set('user-id', 'snapshot-user');

    expect(listsResponse.status).toBe(200);
    expect(listsResponse.body).toHaveLength(0);
  });

  it('adds wrong answers into the mistake book and schedules them for dedicated review', async () => {
    const listResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '错题来源词树',
        description: '验证错题本自动收集',
        context: 'Mistake source list'
      });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.id as string;

    const addWordResponse = await request(app)
      .post(`/api/lists/${listId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'resilient',
        meaning: '有韧性的'
      });

    expect(addWordResponse.status).toBe(201);
    const wordId = addWordResponse.body.id as string;

    const wrongAnswerResponse = await request(app)
      .put(`/api/quiz/${listId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: false, rating: 'again', questionType: 'multiple_choice' }]
      });

    expect(wrongAnswerResponse.status).toBe(200);

    const mistakeBookResponse = await request(app)
      .get('/api/lists/mistake-book')
      .set('user-id', 'snapshot-user');

    expect(mistakeBookResponse.status).toBe(200);
    expect(mistakeBookResponse.body.wordCount).toBe(1);

    const mistakeBookId = mistakeBookResponse.body.id as string;
    const mistakeWordsResponse = await request(app)
      .get(`/api/lists/${mistakeBookId}/words`)
      .set('user-id', 'snapshot-user');

    expect(mistakeWordsResponse.status).toBe(200);
    expect(mistakeWordsResponse.body).toHaveLength(1);
    expect(mistakeWordsResponse.body[0].value).toBe('resilient');

    const wrongWord = await Word.findById(wordId).lean();
    expect(wrongWord?.listMemberships).toHaveLength(2);

    const mistakeMembership = wrongWord?.listMemberships.find((membership) => membership.listId.toString() === mistakeBookId);
    expect(mistakeMembership?.sourceListIds?.map((id) => id.toString())).toContain(listId);

    const recoverResponse = await request(app)
      .put(`/api/learn/${mistakeBookId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: true, rating: 'good', questionType: 'fill_blank' }]
      });

    expect(recoverResponse.status).toBe(200);

    const recoveredMistakeState = await LearningState.findOne({
      userId: 'snapshot-user',
      wordId,
      listId: mistakeBookId
    }).lean();

    expect(recoveredMistakeState?.reviewCount).toBe(1);
    expect(recoveredMistakeState?.consecutiveWrong).toBe(0);
  });
});
