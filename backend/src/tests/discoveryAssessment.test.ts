import express from 'express';
import request from 'supertest';
import { closeDB, connectDB } from '../config/mongodb';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import listRoutes from '../api/lists/routes';
import vocabularyRoutes from '../api/vocabulary/routes';
import * as repoLearningSnapshot from '../services/repoLearningSnapshot';

const app = express();
app.use(express.json());
app.use('/api/lists', listRoutes);
app.use('/api/vocabulary', vocabularyRoutes);

describe('discovery assessment flow', () => {
  beforeAll(async () => {
    await connectDB(1, 100);
  });

  beforeEach(async () => {
    await Promise.all([
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
    await closeDB();
  });

  it('does not count mastered-forever words toward the daily new-word quota, but does count scheduled discovery words', async () => {
    const sourceList = await WordList.create({
      name: '西语3k词-Level0-Pre-A1',
      description: 'Discovery source',
      context: 'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      kind: 'custom'
    });
    const masteredWord = await Word.create({
      value: 'hola',
      listMemberships: [
        {
          listId: sourceList._id,
          meaning: '你好（hello）'
        }
      ]
    });
    const unknownWord = await Word.create({
      value: 'adios',
      listMemberships: [
        {
          listId: sourceList._id,
          meaning: '再见（goodbye）'
        }
      ]
    });

    const masteredResponse = await request(app)
      .post('/api/vocabulary/discovery-rate')
      .set('user-id', 'discovery-user')
      .send({
        wordId: masteredWord._id.toString(),
        sourceListId: sourceList._id.toString(),
        assessment: 'mastered'
      });

    expect(masteredResponse.status).toBe(200);
    expect(masteredResponse.body.countedAsNewWord).toBe(false);
    expect(masteredResponse.body.disciplineStatus.dailyNewWordLimit).toBe(15);
    expect(masteredResponse.body.disciplineStatus.newWordsAddedToday).toBe(0);

    const masteredState = await LearningState.findOne({
      userId: 'discovery-user',
      wordId: masteredWord._id,
      listId: sourceList._id
    }).lean();

    expect(masteredState?.dueAt.toISOString()).toBe('9999-12-31T23:59:59.999Z');

    const unknownResponse = await request(app)
      .post('/api/vocabulary/discovery-rate')
      .set('user-id', 'discovery-user')
      .send({
        wordId: unknownWord._id.toString(),
        sourceListId: sourceList._id.toString(),
        assessment: 'unknown'
      });

    expect(unknownResponse.status).toBe(200);
    expect(unknownResponse.body.countedAsNewWord).toBe(true);
    expect(unknownResponse.body.disciplineStatus.dailyNewWordLimit).toBe(15);
    expect(unknownResponse.body.disciplineStatus.newWordsAddedToday).toBe(1);
    expect(
      unknownResponse.body.disciplineStatus.dailyNewWordLimit - unknownResponse.body.disciplineStatus.newWordsAddedToday
    ).toBe(14);

    const logs = await ReviewLog.find({ userId: 'discovery-user' })
      .sort({ answeredAt: 1 })
      .lean();

    expect(logs).toHaveLength(2);
    expect(logs[0].questionType).toBe('discovery_mastered');
    expect(logs[1].questionType).toBe('discovery_assessment');
  });

  it('still returns success when snapshot persistence fails after a discovery rating is applied', async () => {
    const sourceList = await WordList.create({
      name: '西语3k词-Level0-Pre-A1',
      description: 'Discovery source',
      context: 'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      kind: 'custom'
    });
    const word = await Word.create({
      value: 'verde',
      listMemberships: [
        {
          listId: sourceList._id,
          meaning: '绿色/绿的（green）'
        }
      ]
    });

    const persistSnapshotSpy = jest
      .spyOn(repoLearningSnapshot, 'persistLearningSnapshot')
      .mockRejectedValueOnce(new Error('Snapshot disk write failed'));

    const response = await request(app)
      .post('/api/vocabulary/discovery-rate')
      .set('user-id', 'discovery-user')
      .send({
        wordId: word._id.toString(),
        sourceListId: sourceList._id.toString(),
        assessment: 'mastered'
      });

    expect(response.status).toBe(200);
    expect(response.body.countedAsNewWord).toBe(false);
    expect(response.body.status).toBe('mastered_forever');

    const masteredState = await LearningState.findOne({
      userId: 'discovery-user',
      wordId: word._id,
      listId: sourceList._id
    }).lean();

    expect(masteredState?.dueAt.toISOString()).toBe('9999-12-31T23:59:59.999Z');

    persistSnapshotSpy.mockRestore();
  });
});
