import { State } from 'ts-fsrs';
import { closeDB, connectDB } from '../config/mongodb';
import { LearningState } from '../api/learning-state/model';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { buildSpanishVocabularyListName } from '../scripts/spanishVocabularyData';
import {
  FIXED_DISCOVERY_TARGET_LIST_NAME,
  buildFixedDiscoveryChain,
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

  it('uses the fixed discovery order of private study first, then managed Spanish levels from Level0 upward', async () => {
    const privateStudyList = await WordList.create({
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

    const privateWord = await Word.create({
      value: 'oscuro',
      listMemberships: [
        {
          listId: privateStudyList._id,
          meaning: 'dark'
        }
      ]
    });
    const level0Word = await Word.create({
      value: 'hola',
      listMemberships: [
        {
          listId: level0._id,
          meaning: 'hello'
        }
      ]
    });
    const level1Word = await Word.create({
      value: 'gracias',
      listMemberships: [
        {
          listId: level1._id,
          meaning: 'thanks'
        }
      ]
    });

    let batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(buildFixedDiscoveryChain().slice(0, 3)).toEqual([
      FIXED_DISCOVERY_TARGET_LIST_NAME,
      level0.name,
      level1.name
    ]);
    expect(batch.sourceList?.name).toBe(privateStudyList.name);
    expect(batch.words.map((word) => word.word)).toEqual(['oscuro']);

    await LearningState.create({
      userId: 'discovery-user',
      wordId: privateWord._id,
      listId: privateStudyList._id,
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
    expect(batch.words.map((word) => word.word)).toEqual(['hola']);

    await LearningState.create({
      userId: 'discovery-user',
      wordId: level0Word._id,
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

    expect(batch.sourceList?.name).toBe(level1.name);
    expect(batch.words.map((word) => word.word)).toEqual(['gracias']);

    await LearningState.create({
      userId: 'discovery-user',
      wordId: level1Word._id,
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

    expect(batch.sourceList).toBeNull();
    expect(batch.words).toEqual([]);

    await Word.create({
      value: 'segun',
      listMemberships: [
        {
          listId: privateStudyList._id,
          meaning: 'according to'
        }
      ]
    });

    batch = await selectFixedDiscoveryWords('discovery-user', 10);

    expect(batch.sourceList?.name).toBe(privateStudyList.name);
    expect(batch.words.map((word) => word.word)).toEqual(['segun']);
  });
});
