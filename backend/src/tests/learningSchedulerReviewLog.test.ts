import express from 'express';
import request from 'supertest';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import listRoutes from '../api/lists/routes';
import { ensureLearningState, settleReviewResults, summarizeListProgress } from '../services/learningScheduler';
import { selectScheduledWords } from '../services/learningProgress';

describe('learning scheduler review log signals', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/lists', listRoutes);

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

  it('prioritizes words with recent slow and hint-heavy reviews', async () => {
    const userId = 'scheduler-user';
    const list = await WordList.create({
      name: 'Review Signals',
      description: 'Used to verify personalized scheduling',
      context: 'Testing',
      kind: 'custom'
    });

    const strugglingWord = await Word.create({
      value: 'resurface',
      listMemberships: [{
        listId: list._id,
        meaning: '再次浮现',
        addedAt: new Date(),
        updatedAt: new Date()
      }]
    });

    const stableWord = await Word.create({
      value: 'settle',
      listMemberships: [{
        listId: list._id,
        meaning: '稳定下来',
        addedAt: new Date(),
        updatedAt: new Date()
      }]
    });

    const [strugglingState, stableState] = await Promise.all([
      ensureLearningState(userId, list._id.toString(), strugglingWord),
      ensureLearningState(userId, list._id.toString(), stableWord)
    ]);

    const sameDueAt = new Date('2026-04-10T10:00:00.000Z');
    await Promise.all([
      LearningState.updateOne(
        { _id: strugglingState._id },
        {
          $set: {
            dueAt: sameDueAt,
            difficulty: 5,
            stability: 2,
            reviewCount: 2,
            consecutiveWrong: 0
          }
        }
      ),
      LearningState.updateOne(
        { _id: stableState._id },
        {
          $set: {
            dueAt: sameDueAt,
            difficulty: 5,
            stability: 2,
            reviewCount: 2,
            consecutiveWrong: 0
          }
        }
      )
    ]);

    await ReviewLog.insertMany([
      {
        userId,
        wordId: strugglingWord._id,
        listId: list._id,
        source: 'quiz',
        questionType: 'multiple_choice',
        rating: 'hard',
        correct: true,
        responseTimeMs: 18000,
        usedHint: true,
        answeredAt: new Date('2026-04-10T11:00:00.000Z')
      },
      {
        userId,
        wordId: strugglingWord._id,
        listId: list._id,
        source: 'learn',
        questionType: 'fill_blank',
        rating: 'again',
        correct: false,
        responseTimeMs: 22000,
        usedHint: true,
        answeredAt: new Date('2026-04-09T11:00:00.000Z')
      },
      {
        userId,
        wordId: stableWord._id,
        listId: list._id,
        source: 'quiz',
        questionType: 'multiple_choice',
        rating: 'easy',
        correct: true,
        responseTimeMs: 2800,
        usedHint: false,
        answeredAt: new Date('2026-04-10T11:00:00.000Z')
      },
      {
        userId,
        wordId: stableWord._id,
        listId: list._id,
        source: 'learn',
        questionType: 'fill_blank',
        rating: 'good',
        correct: true,
        responseTimeMs: 3600,
        usedHint: false,
        answeredAt: new Date('2026-04-09T11:00:00.000Z')
      }
    ]);

    const scheduled = await selectScheduledWords(userId, list._id.toString(), 2, 2);

    expect(scheduled[0].id).toBe(strugglingWord._id.toString());
    expect(scheduled[0].state.behaviorRisk).toBeGreaterThan(scheduled[1].state.behaviorRisk);
    expect(scheduled[0].state.averageResponseTimeMs).toBeGreaterThan(scheduled[1].state.averageResponseTimeMs || 0);
  });

  it('exposes list-level review behavior statistics through the lists API', async () => {
    const userId = 'stats-user';
    const list = await WordList.create({
      name: 'Behavior Summary',
      description: 'Used to verify list statistics',
      context: 'Testing',
      kind: 'custom'
    });

    const word = await Word.create({
      value: 'linger',
      listMemberships: [{
        listId: list._id,
        meaning: '逗留',
        addedAt: new Date(),
        updatedAt: new Date()
      }]
    });

    await ensureLearningState(userId, list._id.toString(), word);

    await ReviewLog.insertMany([
      {
        userId,
        wordId: word._id,
        listId: list._id,
        source: 'learn',
        questionType: 'fill_blank',
        rating: 'hard',
        correct: true,
        responseTimeMs: 12000,
        usedHint: true,
        answeredAt: new Date('2026-04-10T08:00:00.000Z')
      },
      {
        userId,
        wordId: word._id,
        listId: list._id,
        source: 'quiz',
        questionType: 'multiple_choice',
        rating: 'again',
        correct: false,
        responseTimeMs: 15000,
        usedHint: false,
        answeredAt: new Date('2026-04-10T09:00:00.000Z')
      },
      {
        userId,
        wordId: word._id,
        listId: list._id,
        source: 'quiz',
        questionType: 'multiple_choice',
        rating: 'good',
        correct: true,
        responseTimeMs: 6000,
        usedHint: false,
        answeredAt: new Date('2026-04-10T10:00:00.000Z')
      }
    ]);

    const summary = await summarizeListProgress(userId, list._id.toString());
    expect(summary.recentReviewCount).toBe(3);
    expect(summary.averageResponseTimeMs).toBe(11000);
    expect(summary.hintUsageRate).toBe(33);
    expect(summary.hardRate).toBe(33);
    expect(summary.againRate).toBe(33);

    const response = await request(app)
      .get('/api/lists')
      .set('user-id', userId);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].recentReviewCount).toBe(3);
    expect(response.body[0].averageResponseTimeMs).toBe(11000);
    expect(response.body[0].hintUsageRate).toBe(33);
    expect(response.body[0].hardRate).toBe(33);
    expect(response.body[0].againRate).toBe(33);
  });

  it('treats self-assessed unfamiliar words as harder review signals', async () => {
    const userId = 'self-assessment-user';
    const list = await WordList.create({
      name: 'Self Assessment',
      description: 'Used to verify manual unfamiliar flags',
      context: 'Testing',
      kind: 'custom'
    });

    const [targetWord, distractorWord] = await Promise.all([
      Word.create({
        value: 'anchor',
        listMemberships: [{
          listId: list._id,
          meaning: '锚点',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      }),
      Word.create({
        value: 'harbor',
        listMemberships: [{
          listId: list._id,
          meaning: '港口',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      })
    ]);

    await Promise.all([
      ensureLearningState(userId, list._id.toString(), targetWord),
      ensureLearningState(userId, list._id.toString(), distractorWord)
    ]);

    await settleReviewResults(userId, list, 'learn', [{
      wordId: targetWord._id.toString(),
      correct: true,
      rating: 'good',
      questionType: 'multiple_choice',
      selfAssessedWordIds: [distractorWord._id.toString()]
    }]);

    const distractorState = await LearningState.findOne({
      userId,
      wordId: distractorWord._id,
      listId: list._id
    }).lean();
    const distractorLog = await ReviewLog.findOne({
      userId,
      wordId: distractorWord._id,
      listId: list._id
    }).lean();

    expect(distractorState?.reviewCount).toBe(1);
    expect(distractorState?.lastRating).toBe('hard');
    expect(distractorLog?.rating).toBe('hard');
    expect(distractorLog?.questionType).toBe('multiple_choice_self_assessment');
  });

  it('schedules hard reviews with the same penalty as again', async () => {
    const userId = 'hard-equals-again-user';
    const list = await WordList.create({
      name: 'Hard Equals Again',
      description: 'Used to verify hard penalty matches again',
      context: 'Testing',
      kind: 'custom'
    });

    const [hardWord, againWord] = await Promise.all([
      Word.create({
        value: 'ridge',
        listMemberships: [{
          listId: list._id,
          meaning: '灞辫剨',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      }),
      Word.create({
        value: 'valley',
        listMemberships: [{
          listId: list._id,
          meaning: '灞辫胺',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      })
    ]);

    const [hardState, againState] = await Promise.all([
      ensureLearningState(userId, list._id.toString(), hardWord),
      ensureLearningState(userId, list._id.toString(), againWord)
    ]);

    const alignedDueAt = new Date('2026-04-10T10:00:00.000Z');
    const alignedState = {
      dueAt: alignedDueAt,
      stability: 5,
      difficulty: 5,
      scheduledDays: 5,
      elapsedDays: 5,
      reps: 3,
      lapses: 0,
      learningSteps: 0,
      state: 2,
      reviewCount: 3,
      lapseCount: 0,
      consecutiveCorrect: 2,
      consecutiveWrong: 0
    };

    await Promise.all([
      LearningState.updateOne({ _id: hardState._id }, { $set: alignedState }),
      LearningState.updateOne({ _id: againState._id }, { $set: alignedState })
    ]);

    await settleReviewResults(userId, list, 'quiz', [
      {
        wordId: hardWord._id.toString(),
        correct: true,
        rating: 'hard',
        questionType: 'multiple_choice'
      },
      {
        wordId: againWord._id.toString(),
        correct: true,
        rating: 'again',
        questionType: 'multiple_choice'
      }
    ]);

    const [hardAfter, againAfter] = await Promise.all([
      LearningState.findOne({ userId, wordId: hardWord._id, listId: list._id }).lean(),
      LearningState.findOne({ userId, wordId: againWord._id, listId: list._id }).lean()
    ]);

    expect(hardAfter?.dueAt.toISOString()).toBe(againAfter?.dueAt.toISOString());
    expect(hardAfter?.stability).toBeCloseTo(againAfter?.stability || 0, 10);
    expect(hardAfter?.difficulty).toBeCloseTo(againAfter?.difficulty || 0, 10);
    expect(hardAfter?.state).toBe(againAfter?.state);
    expect(hardAfter?.scheduledDays).toBe(againAfter?.scheduledDays);
    expect(hardAfter?.lastRating).toBe('hard');
    expect(againAfter?.lastRating).toBe('again');
  });

  it('replaces an already-settled attempt instead of double-counting the same review', async () => {
    const userId = 'replace-settlement-user';
    const list = await WordList.create({
      name: 'Replace Settlement',
      description: 'Used to verify re-settlement stays idempotent',
      context: 'Testing',
      kind: 'custom'
    });

    const word = await Word.create({
      value: 'brisa',
      listMemberships: [{
        listId: list._id,
        meaning: '微风',
        addedAt: new Date(),
        updatedAt: new Date()
      }]
    });

    await ensureLearningState(userId, list._id.toString(), word);

    await settleReviewResults(userId, list, 'learn', [{
      wordId: word._id.toString(),
      correct: true,
      rating: 'good',
      questionType: 'fill_blank',
      settlementKey: 'attempt-1',
      answeredAt: '2026-04-16T10:00:00.000Z'
    }]);

    const stateAfterFirstSettlement = await LearningState.findOne({
      userId,
      wordId: word._id,
      listId: list._id
    }).lean();

    await settleReviewResults(userId, list, 'learn', [{
      wordId: word._id.toString(),
      correct: true,
      rating: 'hard',
      questionType: 'fill_blank',
      settlementKey: 'attempt-1',
      answeredAt: '2026-04-16T10:00:00.000Z'
    }]);

    const [stateAfterReplacement, replacementLogs] = await Promise.all([
      LearningState.findOne({ userId, wordId: word._id, listId: list._id }).lean(),
      ReviewLog.find({ userId, wordId: word._id, listId: list._id }).lean()
    ]);

    expect(stateAfterFirstSettlement?.reviewCount).toBe(1);
    expect(stateAfterReplacement?.reviewCount).toBe(1);
    expect(stateAfterReplacement?.lastRating).toBe('hard');
    expect(replacementLogs).toHaveLength(1);
    expect(replacementLogs[0].rating).toBe('hard');
    expect(replacementLogs[0].settlementKey).toBe('attempt-1');
    expect(stateAfterReplacement?.dueAt.toISOString()).not.toBe(stateAfterFirstSettlement?.dueAt.toISOString());
  });

  it('removes stale self-assessment settlement effects when the same attempt is re-settled', async () => {
    const userId = 'replace-self-assessment-user';
    const list = await WordList.create({
      name: 'Replace Self Assessment',
      description: 'Used to verify stale self-assessment effects are rolled back',
      context: 'Testing',
      kind: 'custom'
    });

    const [targetWord, flaggedWord] = await Promise.all([
      Word.create({
        value: 'costa',
        listMemberships: [{
          listId: list._id,
          meaning: '海岸',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      }),
      Word.create({
        value: 'playa',
        listMemberships: [{
          listId: list._id,
          meaning: '海滩',
          addedAt: new Date(),
          updatedAt: new Date()
        }]
      })
    ]);

    await Promise.all([
      ensureLearningState(userId, list._id.toString(), targetWord),
      ensureLearningState(userId, list._id.toString(), flaggedWord)
    ]);

    await settleReviewResults(userId, list, 'learn', [{
      wordId: targetWord._id.toString(),
      correct: true,
      rating: 'good',
      questionType: 'fill_blank',
      selfAssessedWordIds: [flaggedWord._id.toString()],
      settlementKey: 'attempt-2',
      answeredAt: '2026-04-16T11:00:00.000Z'
    }]);

    await settleReviewResults(userId, list, 'learn', [{
      wordId: targetWord._id.toString(),
      correct: true,
      rating: 'good',
      questionType: 'fill_blank',
      settlementKey: 'attempt-2',
      answeredAt: '2026-04-16T11:00:00.000Z'
    }]);

    const [targetState, flaggedState, flaggedLog] = await Promise.all([
      LearningState.findOne({ userId, wordId: targetWord._id, listId: list._id }).lean(),
      LearningState.findOne({ userId, wordId: flaggedWord._id, listId: list._id }).lean(),
      ReviewLog.findOne({ userId, wordId: flaggedWord._id, listId: list._id }).lean()
    ]);

    expect(targetState?.reviewCount).toBe(1);
    expect(flaggedState?.reviewCount).toBe(0);
    expect(flaggedState?.lastRating).toBeUndefined();
    expect(flaggedLog).toBeNull();
  });
});
