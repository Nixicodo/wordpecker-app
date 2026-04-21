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
    expect(masteredResponse.body.disciplineStatus.dailyNewWordLimit).toBe(35);
    expect(masteredResponse.body.disciplineStatus.dailyNewWordLimits).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 5
    });
    expect(masteredResponse.body.disciplineStatus.newWordsAddedToday).toBe(0);
    expect(masteredResponse.body.disciplineStatus.newWordsAddedTodayByAssessment).toEqual({
      familiar: 0,
      uncertain: 0,
      unknown: 0
    });
    expect(masteredResponse.body.disciplineStatus.remainingNewWordQuotaByAssessment).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 5
    });

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
    expect(unknownResponse.body.disciplineStatus.dailyNewWordLimit).toBe(35);
    expect(unknownResponse.body.disciplineStatus.newWordsAddedToday).toBe(1);
    expect(unknownResponse.body.disciplineStatus.newWordsAddedTodayByAssessment).toEqual({
      familiar: 0,
      uncertain: 0,
      unknown: 1
    });
    expect(
      unknownResponse.body.disciplineStatus.dailyNewWordLimit - unknownResponse.body.disciplineStatus.newWordsAddedToday
    ).toBe(34);
    expect(unknownResponse.body.disciplineStatus.remainingNewWordQuotaByAssessment).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 4
    });

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

  it('enforces separate daily discovery quotas for unknown, uncertain, and familiar assessments', async () => {
    const sourceList = await WordList.create({
      name: 'Separate daily quotas',
      description: 'Discovery source',
      context: 'Used to verify per-assessment discovery limits',
      kind: 'custom'
    });

    const words = await Word.insertMany(
      Array.from({ length: 38 }, (_, index) => ({
        value: `quota-word-${index + 1}`,
        listMemberships: [
          {
            listId: sourceList._id,
            meaning: `Meaning ${index + 1}`
          }
        ]
      }))
    );

    const rateWord = (wordId: string, assessment: 'familiar' | 'uncertain' | 'unknown') => request(app)
      .post('/api/vocabulary/discovery-rate')
      .set('user-id', 'quota-user')
      .send({
        wordId,
        sourceListId: sourceList._id.toString(),
        assessment
      });

    for (let index = 0; index < 5; index += 1) {
      const response = await rateWord(words[index]._id.toString(), 'unknown');
      expect(response.status).toBe(200);
    }

    const sixthUnknownResponse = await rateWord(words[5]._id.toString(), 'unknown');
    expect(sixthUnknownResponse.status).toBe(409);
    expect(sixthUnknownResponse.body.code).toBe('DISCOVERY_ASSESSMENT_QUOTA_REACHED');
    expect(sixthUnknownResponse.body.assessment).toBe('unknown');

    for (let index = 6; index < 16; index += 1) {
      const response = await rateWord(words[index]._id.toString(), 'uncertain');
      expect(response.status).toBe(200);
    }

    const eleventhUncertainResponse = await rateWord(words[16]._id.toString(), 'uncertain');
    expect(eleventhUncertainResponse.status).toBe(409);
    expect(eleventhUncertainResponse.body.code).toBe('DISCOVERY_ASSESSMENT_QUOTA_REACHED');
    expect(eleventhUncertainResponse.body.assessment).toBe('uncertain');

    for (let index = 17; index < 37; index += 1) {
      const response = await rateWord(words[index]._id.toString(), 'familiar');
      expect(response.status).toBe(200);
    }

    const twentyFirstFamiliarResponse = await rateWord(words[37]._id.toString(), 'familiar');
    expect(twentyFirstFamiliarResponse.status).toBe(409);
    expect(twentyFirstFamiliarResponse.body.code).toBe('DISCOVERY_ASSESSMENT_QUOTA_REACHED');
    expect(twentyFirstFamiliarResponse.body.assessment).toBe('familiar');

    const statusResponse = await request(app)
      .get('/api/lists/discipline-status')
      .set('user-id', 'quota-user');

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.entryState).toBe('soft_locked');
    expect(statusResponse.body.dailyNewWordLimit).toBe(35);
    expect(statusResponse.body.newWordsAddedToday).toBe(35);
    expect(statusResponse.body.newWordsAddedTodayByAssessment).toEqual({
      familiar: 20,
      uncertain: 10,
      unknown: 5
    });
    expect(statusResponse.body.remainingNewWordQuota).toBe(0);
    expect(statusResponse.body.remainingNewWordQuotaByAssessment).toEqual({
      familiar: 0,
      uncertain: 0,
      unknown: 0
    });
  });
});
