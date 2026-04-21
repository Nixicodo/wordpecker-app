import fs from 'fs';
import os from 'os';
import path from 'path';
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
  DEFAULT_BASE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE
} from '../api/preferences/defaults';
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
  const originalSnapshotPathEnv = process.env.LEARNING_SNAPSHOT_PATH;
  const snapshotPath = path.join(os.tmpdir(), `wordpecker-learning-snapshot-${process.pid}.json`);
  const app = express();

  app.use(express.json());
  app.use('/api/lists', listRoutes);
  app.use('/api/lists', wordRoutes);
  app.use('/api/preferences', preferencesRoutes);
  app.use('/api/learn', learnRoutes);
  app.use('/api/quiz', quizRoutes);

  beforeAll(async () => {
    process.env.LEARNING_SNAPSHOT_PATH = snapshotPath;
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
    if (originalSnapshotPathEnv) {
      process.env.LEARNING_SNAPSHOT_PATH = originalSnapshotPathEnv;
    } else {
      delete process.env.LEARNING_SNAPSHOT_PATH;
    }
    await closeDB();
  });

  it('persists repository snapshot after real API writes and restores it into an empty database', async () => {
    const preferencesResponse = await request(app)
      .get('/api/preferences')
      .set('user-id', 'snapshot-user');

    expect(preferencesResponse.status).toBe(200);
    expect(preferencesResponse.body.baseLanguage).toBe(DEFAULT_BASE_LANGUAGE);

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
    expect(restoredPreferences?.targetLanguage).toBe(DEFAULT_TARGET_LANGUAGE);

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

  it('syncs a word learning state across lists and seeds newly linked lists from the existing record', async () => {
    const listOneResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '词树一',
        description: '源学习记录',
        context: 'Tree one'
      });

    const listTwoResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '词树二',
        description: '同步后的学习记录',
        context: 'Tree two'
      });

    expect(listOneResponse.status).toBe(201);
    expect(listTwoResponse.status).toBe(201);

    const listOneId = listOneResponse.body.id as string;
    const listTwoId = listTwoResponse.body.id as string;

    const addToFirstListResponse = await request(app)
      .post(`/api/lists/${listOneId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'camino',
        meaning: '道路'
      });

    expect(addToFirstListResponse.status).toBe(201);
    const wordId = addToFirstListResponse.body.id as string;

    const reviewInFirstListResponse = await request(app)
      .put(`/api/quiz/${listOneId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: true, rating: 'good', questionType: 'multiple_choice' }]
      });

    expect(reviewInFirstListResponse.status).toBe(200);

    const addToSecondListResponse = await request(app)
      .post(`/api/lists/${listTwoId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'camino',
        meaning: '路线'
      });

    expect(addToSecondListResponse.status).toBe(201);
    expect(addToSecondListResponse.body.reviewCount).toBe(1);

    const secondListStateAfterLink = await LearningState.findOne({
      userId: 'snapshot-user',
      wordId,
      listId: listTwoId
    }).lean();

    expect(secondListStateAfterLink?.reviewCount).toBe(1);
    expect(secondListStateAfterLink?.lastSource).toBe('quiz');

    const reviewInSecondListResponse = await request(app)
      .put(`/api/learn/${listTwoId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId, correct: true, rating: 'easy', questionType: 'fill_blank' }]
      });

    expect(reviewInSecondListResponse.status).toBe(200);

    const [firstListState, secondListState] = await Promise.all([
      LearningState.findOne({ userId: 'snapshot-user', wordId, listId: listOneId }).lean(),
      LearningState.findOne({ userId: 'snapshot-user', wordId, listId: listTwoId }).lean()
    ]);

    expect(firstListState?.reviewCount).toBe(2);
    expect(secondListState?.reviewCount).toBe(2);
    expect(firstListState?.lastRating).toBe('easy');
    expect(secondListState?.lastRating).toBe('easy');
    expect(firstListState?.dueAt.toISOString()).toBe(secondListState?.dueAt.toISOString());
  });

  it('settles matching reviews for all words included in the same question', async () => {
    const listResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '配对题结算词树',
        description: '验证配对题按 4 个词结算',
        context: 'Matching settlement'
      });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.id as string;

    const seedWords = [
      { word: 'uno', meaning: '一' },
      { word: 'dos', meaning: '二' },
      { word: 'tres', meaning: '三' },
      { word: 'cuatro', meaning: '四' }
    ];

    const importedWordIds: string[] = [];
    for (const seedWord of seedWords) {
      const addWordResponse = await request(app)
        .post(`/api/lists/${listId}/words`)
        .set('user-id', 'snapshot-user')
        .send(seedWord);

      expect(addWordResponse.status).toBe(201);
      importedWordIds.push(addWordResponse.body.id as string);
    }

    const settleMatchingResponse = await request(app)
      .put(`/api/quiz/${listId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{
          wordId: importedWordIds[0],
          wordIds: importedWordIds,
          correct: true,
          rating: 'good',
          questionType: 'matching'
        }]
      });

    expect(settleMatchingResponse.status).toBe(200);

    const states = await LearningState.find({
      userId: 'snapshot-user',
      wordId: { $in: importedWordIds },
      listId
    }).lean();
    const logs = await ReviewLog.find({
      userId: 'snapshot-user',
      wordId: { $in: importedWordIds },
      listId
    }).lean();

    expect(states).toHaveLength(4);
    expect(states.every((state) => state.reviewCount === 1)).toBe(true);
    expect(logs).toHaveLength(4);
    expect(logs.every((log) => log.questionType === 'matching')).toBe(true);
  });

  it('reports discipline status for due-first review and daily new-word quota', async () => {
    const statusResponse = await request(app)
      .get('/api/lists/discipline-status')
      .set('user-id', 'snapshot-user');

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.entryState).toBe('open');
    expect(statusResponse.body.dailyNewWordLimit).toBe(35);
    expect(statusResponse.body.dailyNewWordLimits).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 5
    });
    expect(statusResponse.body.remainingNewWordQuota).toBe(35);
    expect(statusResponse.body.remainingNewWordQuotaByAssessment).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 5
    });
    expect(statusResponse.body.dueCount).toBe(0);
  });

  it('creates and exposes the due review list as a dedicated system list', async () => {
    const dueReviewResponse = await request(app)
      .get('/api/lists/due-review')
      .set('user-id', 'snapshot-user');

    expect(dueReviewResponse.status).toBe(200);
    expect(dueReviewResponse.body.kind).toBe('due_review');
    expect(dueReviewResponse.body.systemKey).toBe('due-review');

    const listsResponse = await request(app)
      .get('/api/lists')
      .set('user-id', 'snapshot-user');

    expect(listsResponse.status).toBe(200);
    expect(listsResponse.body).toHaveLength(0);
  });

  it('keeps untouched new words out of due review counts', async () => {
    const listResponse = await request(app)
      .post('/api/lists')
      .send({
        name: 'New words only',
        description: 'Verify untouched new words stay out of due review',
        context: 'Fresh words'
      });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.id as string;

    const addWordResponse = await request(app)
      .post(`/api/lists/${listId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'untouched',
        meaning: '未开始学习的'
      });

    expect(addWordResponse.status).toBe(201);

    const listsResponse = await request(app)
      .get('/api/lists')
      .set('user-id', 'snapshot-user');

    expect(listsResponse.status).toBe(200);
    expect(listsResponse.body).toHaveLength(1);
    expect(listsResponse.body[0].dueCount).toBe(0);
    expect(listsResponse.body[0].newCount).toBe(1);

    const dueReviewResponse = await request(app)
      .get('/api/lists/due-review')
      .set('user-id', 'snapshot-user');

    expect(dueReviewResponse.status).toBe(200);
    expect(dueReviewResponse.body.wordCount).toBe(0);
    expect(dueReviewResponse.body.dueCount).toBe(0);
  });

  it('keeps wrong answers inside due review instead of creating a separate mistake book', async () => {
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

    const wrongWord = await Word.findById(wordId).lean();
    expect(wrongWord?.listMemberships).toHaveLength(1);

    const dueReviewResponse = await request(app)
      .get('/api/lists/due-review')
      .set('user-id', 'snapshot-user');

    expect(dueReviewResponse.status).toBe(200);
    expect(dueReviewResponse.body.wordCount).toBe(1);

    const dueReviewId = dueReviewResponse.body.id as string;
    const dueWordsResponse = await request(app)
      .get(`/api/lists/${dueReviewId}/words`)
      .set('user-id', 'snapshot-user');
    expect(dueWordsResponse.status).toBe(200);
    expect(dueWordsResponse.body).toHaveLength(1);
    expect(dueWordsResponse.body[0].value).toBe('resilient');

    const recoverResponse = await request(app)
      .put(`/api/learn/${dueReviewId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{
          wordId,
          correct: true,
          rating: 'good',
          questionType: 'fill_blank',
          sourceListId: listId
        }]
      });

    expect(recoverResponse.status).toBe(200);

    const recoveredSourceState = await LearningState.findOne({
      userId: 'snapshot-user',
      wordId,
      listId
    }).lean();

    expect(recoveredSourceState?.reviewCount).toBe(2);
    expect(recoveredSourceState?.consecutiveWrong).toBe(0);
  });

  it('aggregates due review words across trees and settles reviews back to each source tree', async () => {
    const listOneResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '待复习来源一',
        description: '第一个来源词树',
        context: 'Tree one'
      });

    const listTwoResponse = await request(app)
      .post('/api/lists')
      .send({
        name: '待复习来源二',
        description: '第二个来源词树',
        context: 'Tree two'
      });

    expect(listOneResponse.status).toBe(201);
    expect(listTwoResponse.status).toBe(201);

    const listOneId = listOneResponse.body.id as string;
    const listTwoId = listTwoResponse.body.id as string;

    const wordOneResponse = await request(app)
      .post(`/api/lists/${listOneId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'reviewable',
        meaning: '可复习的'
      });

    const wordTwoResponse = await request(app)
      .post(`/api/lists/${listTwoId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'traceback',
        meaning: '回溯'
      });

    const futureWordResponse = await request(app)
      .post(`/api/lists/${listTwoId}/words`)
      .set('user-id', 'snapshot-user')
      .send({
        word: 'tomorrow',
        meaning: '明天'
      });

    expect(wordOneResponse.status).toBe(201);
    expect(wordTwoResponse.status).toBe(201);
    expect(futureWordResponse.status).toBe(201);

    const wordOneId = wordOneResponse.body.id as string;
    const wordTwoId = wordTwoResponse.body.id as string;
    const futureWordId = futureWordResponse.body.id as string;

    const reviewOneResponse = await request(app)
      .put(`/api/learn/${listOneId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId: wordOneId, correct: true, rating: 'good', questionType: 'fill_blank' }]
      });

    const reviewTwoResponse = await request(app)
      .put(`/api/learn/${listTwoId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId: wordTwoId, correct: true, rating: 'good', questionType: 'fill_blank' }]
      });

    const reviewFutureResponse = await request(app)
      .put(`/api/learn/${listTwoId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{ wordId: futureWordId, correct: true, rating: 'good', questionType: 'fill_blank' }]
      });

    expect(reviewOneResponse.status).toBe(200);
    expect(reviewTwoResponse.status).toBe(200);
    expect(reviewFutureResponse.status).toBe(200);

    const now = new Date();
    const dueToday = new Date(now.getTime() - 60 * 60 * 1000);
    const dueTomorrow = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    await Promise.all([
      LearningState.updateOne(
        { userId: 'snapshot-user', wordId: wordOneId, listId: listOneId },
        { $set: { dueAt: dueToday } }
      ),
      LearningState.updateOne(
        { userId: 'snapshot-user', wordId: wordTwoId, listId: listTwoId },
        { $set: { dueAt: dueToday } }
      ),
      LearningState.updateOne(
        { userId: 'snapshot-user', wordId: futureWordId, listId: listTwoId },
        { $set: { dueAt: dueTomorrow } }
      )
    ]);

    const dueReviewResponse = await request(app)
      .get('/api/lists/due-review')
      .set('user-id', 'snapshot-user');

    expect(dueReviewResponse.status).toBe(200);
    expect(dueReviewResponse.body.wordCount).toBe(2);
    expect(dueReviewResponse.body.sourceListCount).toBe(2);

    const dueReviewId = dueReviewResponse.body.id as string;
    const dueWordsResponse = await request(app)
      .get(`/api/lists/${dueReviewId}/words`)
      .set('user-id', 'snapshot-user');

    expect(dueWordsResponse.status).toBe(200);
    expect(dueWordsResponse.body).toHaveLength(2);
    expect(dueWordsResponse.body.map((word: { id: string }) => word.id)).toEqual(
      expect.arrayContaining([wordOneId, wordTwoId])
    );
    expect(dueWordsResponse.body.map((word: { id: string }) => word.id)).not.toContain(futureWordId);

    const settleDueReviewResponse = await request(app)
      .put(`/api/learn/${dueReviewId}/reviews`)
      .set('user-id', 'snapshot-user')
      .send({
        results: [{
          wordId: wordOneId,
          wordIds: [wordOneId, wordTwoId],
          sourceListId: listOneId,
          sourceListIdByWordId: {
            [wordOneId]: listOneId,
            [wordTwoId]: listTwoId
          },
          correct: true,
          rating: 'good',
          questionType: 'matching'
        }]
      });

    expect(settleDueReviewResponse.status).toBe(200);

    const [listOneState, listTwoState, dueReviewLogs] = await Promise.all([
      LearningState.findOne({ userId: 'snapshot-user', wordId: wordOneId, listId: listOneId }).lean(),
      LearningState.findOne({ userId: 'snapshot-user', wordId: wordTwoId, listId: listTwoId }).lean(),
      ReviewLog.find({
        userId: 'snapshot-user',
        wordId: { $in: [wordOneId, wordTwoId] },
        source: 'due_review'
      }).lean()
    ]);

    expect(listOneState?.reviewCount).toBe(2);
    expect(listTwoState?.reviewCount).toBe(2);
    expect(listOneState?.lastSource).toBe('due_review');
    expect(listTwoState?.lastSource).toBe('due_review');
    expect(dueReviewLogs).toHaveLength(2);
    expect(dueReviewLogs.every((log) => log.source === 'due_review')).toBe(true);
  });
});
