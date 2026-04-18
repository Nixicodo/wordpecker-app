import { State } from 'ts-fsrs';
import { closeDB, connectDB } from '../config/mongodb';
import { LearningState } from '../api/learning-state/model';
import { ReviewLog } from '../api/review-log/model';
import { Word } from '../api/words/model';
import { WordList } from '../api/lists/model';
import { UserPreferences } from '../api/preferences/model';
import { resetLearningProgress } from '../services/resetLearningProgress';

describe('resetLearningProgress', () => {
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
  });

  afterAll(async () => {
    await Promise.all([
      ReviewLog.deleteMany({}),
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({}),
      UserPreferences.deleteMany({})
    ]);
    await closeDB();
  });

  it('removes learning history and stale mistake-book entries while keeping core content intact', async () => {
    const sourceList = await WordList.create({
      name: 'Reset Source',
      description: 'Source list kept after reset',
      context: 'Reset test',
      kind: 'custom'
    });
    const mistakeBook = await WordList.create({
      name: '错题本',
      description: 'Auto collected mistakes',
      context: 'Mistake review',
      kind: 'mistake_book',
      systemKey: 'mistake-book'
    });

    const sharedWord = await Word.create({
      value: 'hola-reset',
      listMemberships: [
        {
          listId: sourceList._id,
          meaning: '你好'
        },
        {
          listId: mistakeBook._id,
          meaning: '你好',
          sourceListIds: [sourceList._id]
        }
      ]
    });

    const orphanMistakeWord = await Word.create({
      value: 'orphan-mistake-only',
      listMemberships: [
        {
          listId: mistakeBook._id,
          meaning: '仅存在于错题本'
        }
      ]
    });

    await LearningState.create({
      userId: 'reset-user',
      wordId: sharedWord._id,
      listId: sourceList._id,
      dueAt: new Date('2026-04-01T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-03-31T00:00:00.000Z'),
      stability: 3.2,
      difficulty: 4.1,
      scheduledDays: 2,
      elapsedDays: 1,
      reps: 1,
      lapses: 0,
      learningSteps: 0,
      state: State.Review,
      reviewCount: 1,
      lapseCount: 0,
      consecutiveCorrect: 1,
      consecutiveWrong: 0,
      lastRating: 'good',
      lastSource: 'learn'
    });

    await LearningState.create({
      userId: 'other-user',
      wordId: sharedWord._id,
      listId: sourceList._id,
      dueAt: new Date('2026-04-02T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-04-01T00:00:00.000Z'),
      stability: 4.8,
      difficulty: 3.7,
      scheduledDays: 3,
      elapsedDays: 2,
      reps: 2,
      lapses: 0,
      learningSteps: 0,
      state: State.Review,
      reviewCount: 2,
      lapseCount: 0,
      consecutiveCorrect: 2,
      consecutiveWrong: 0,
      lastRating: 'easy',
      lastSource: 'quiz'
    });

    await ReviewLog.create({
      userId: 'reset-user',
      wordId: sharedWord._id,
      listId: sourceList._id,
      source: 'learn',
      questionType: 'fill_blank',
      rating: 'good',
      correct: true,
      answeredAt: new Date('2026-04-01T00:00:00.000Z')
    });

    await ReviewLog.create({
      userId: 'other-user',
      wordId: sharedWord._id,
      listId: sourceList._id,
      source: 'quiz',
      questionType: 'multiple_choice',
      rating: 'easy',
      correct: true,
      answeredAt: new Date('2026-04-02T00:00:00.000Z')
    });

    await UserPreferences.create({
      userId: 'reset-user',
      exerciseTypes: { fill_blank: true },
      baseLanguage: 'zh-CN',
      targetLanguage: 'es'
    });

    const result = await resetLearningProgress('reset-user');

    expect(result).toMatchObject({
      userId: 'reset-user',
      deletedLearningStates: 1,
      deletedReviewLogs: 1,
      removedMistakeMemberships: 2,
      deletedOrphanWords: 1
    });

    expect(await LearningState.findOne({ userId: 'reset-user' }).lean()).toBeNull();
    expect(await ReviewLog.findOne({ userId: 'reset-user' }).lean()).toBeNull();
    expect(await LearningState.findOne({ userId: 'other-user' }).lean()).not.toBeNull();
    expect(await ReviewLog.findOne({ userId: 'other-user' }).lean()).not.toBeNull();

    const refreshedSharedWord = await Word.findById(sharedWord._id).lean();
    expect(refreshedSharedWord?.listMemberships).toHaveLength(1);
    expect(refreshedSharedWord?.listMemberships[0].listId.toString()).toBe(sourceList._id.toString());
    expect(await Word.findById(orphanMistakeWord._id).lean()).toBeNull();

    expect(await WordList.findById(sourceList._id).lean()).not.toBeNull();
    expect(await UserPreferences.findOne({ userId: 'reset-user' }).lean()).not.toBeNull();
  });
});
