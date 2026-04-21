import { State } from 'ts-fsrs';
import { closeDB, connectDB } from '../config/mongodb';
import { LearningState } from '../api/learning-state/model';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { buildSpanishVocabularyListName } from '../scripts/spanishVocabularyData';
import {
  FIXED_DISCOVERY_TARGET_LIST_NAME,
  selectFixedDiscoveryWords
} from '../services/fixedDiscoveryChain';

describe('selectFixedDiscoveryWords', () => {
  beforeAll(async () => {
    await connectDB(1, 100);
  });

  beforeEach(async () => {
    await Promise.all([
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      LearningState.deleteMany({}),
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
    await closeDB();
  });

  it('always prefers the first source list in the reverse discovery chain that still has undiscovered words', async () => {
    await WordList.create({
      name: FIXED_DISCOVERY_TARGET_LIST_NAME,
      description: 'Discovery root',
      context: 'Private study root',
      kind: 'custom'
    });
    const level0 = await WordList.create({
      name: buildSpanishVocabularyListName(0),
      description: 'Level 0',
      context: 'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      kind: 'custom'
    });
    const level1 = await WordList.create({
      name: buildSpanishVocabularyListName(1),
      description: 'Level 1',
      context: 'Mexican Spanish frequency vocabulary level 1 (A1)',
      kind: 'custom'
    });

    const hola = await Word.create({
      value: 'hola',
      listMemberships: [
        {
          listId: level0._id,
          meaning: 'hello'
        }
      ]
    });
    const adios = await Word.create({
      value: 'adios',
      listMemberships: [
        {
          listId: level0._id,
          meaning: 'goodbye'
        }
      ]
    });
    const gracias = await Word.create({
      value: 'gracias',
      listMemberships: [
        {
          listId: level1._id,
          meaning: 'thanks'
        }
      ]
    });

    let batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(batch.sourceList?.name).toBe(level1.name);
    expect(batch.words.map((word) => word.word)).toEqual(['gracias']);

    await LearningState.create({
      userId: 'discovery-user',
      wordId: gracias._id,
      listId: level1._id,
      dueAt: new Date('2026-05-01T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-04-18T00:00:00.000Z'),
      stability: 3,
      difficulty: 3,
      scheduledDays: 4,
      elapsedDays: 0,
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

    batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(batch.sourceList?.name).toBe(level0.name);
    expect(batch.words.map((word) => word.word).sort()).toEqual(['adios', 'hola']);

    await LearningState.create({
      userId: 'discovery-user',
      wordId: hola._id,
      listId: level0._id,
      dueAt: new Date('2026-05-01T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-04-18T00:00:00.000Z'),
      stability: 3,
      difficulty: 3,
      scheduledDays: 4,
      elapsedDays: 0,
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
      userId: 'discovery-user',
      wordId: adios._id,
      listId: level0._id,
      dueAt: new Date('2026-05-01T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-04-18T00:00:00.000Z'),
      stability: 3,
      difficulty: 3,
      scheduledDays: 4,
      elapsedDays: 0,
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

    batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(batch.sourceList).toBeNull();
    expect(batch.words).toEqual([]);

    await Word.create({
      value: 'buenos dias',
      listMemberships: [
        {
          listId: level0._id,
          meaning: 'good morning'
        }
      ]
    });

    batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(batch.sourceList?.name).toBe(level0.name);
    expect(batch.words.map((word) => word.word)).toEqual(['buenos dias']);
  });
});
