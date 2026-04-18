import { closeDB, connectDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
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
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      Word.deleteMany({}),
      WordList.deleteMany({})
    ]);
    await closeDB();
  });

  it('always prefers the oldest source list that still has unseen words', async () => {
    const targetList = await WordList.create({
      name: FIXED_DISCOVERY_TARGET_LIST_NAME,
      description: 'Private study target list',
      context: 'Private study',
      kind: 'custom'
    });
    const level0 = await WordList.create({
      name: '西语3k词-Level0-Pre-A1',
      description: 'Level 0',
      context: 'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      kind: 'custom'
    });
    const level1 = await WordList.create({
      name: '西语3k词-Level1-A1',
      description: 'Level 1',
      context: 'Mexican Spanish frequency vocabulary level 1 (A1)',
      kind: 'custom'
    });

    await Word.create({
      value: 'hola',
      listMemberships: [
        {
          listId: level0._id,
          meaning: '你好（hello）'
        }
      ]
    });
    await Word.create({
      value: 'adios',
      listMemberships: [
        {
          listId: level0._id,
          meaning: '再见（goodbye）'
        }
      ]
    });
    await Word.create({
      value: 'gracias',
      listMemberships: [
        {
          listId: level1._id,
          meaning: '谢谢（thanks）'
        }
      ]
    });

    let batch = await selectFixedDiscoveryWords(10);

    expect(batch.targetList.name).toBe(FIXED_DISCOVERY_TARGET_LIST_NAME);
    expect(batch.sourceList?.name).toBe(level0.name);
    expect(batch.words.map((word) => word.word).sort()).toEqual(['adios', 'hola']);

    const adios = await Word.findOne({ value: 'adios' });
    const hola = await Word.findOne({ value: 'hola' });

    adios?.listMemberships.push({
      listId: targetList._id,
      meaning: '再见（goodbye）'
    });
    hola?.listMemberships.push({
      listId: targetList._id,
      meaning: '你好（hello）'
    });

    await Promise.all([
      adios?.save(),
      hola?.save()
    ]);

    batch = await selectFixedDiscoveryWords(10);

    expect(batch.sourceList?.name).toBe(level1.name);
    expect(batch.words.map((word) => word.word)).toEqual(['gracias']);

    await Word.create({
      value: 'buenos dias',
      listMemberships: [
        {
          listId: level0._id,
          meaning: '早上好（good morning）'
        }
      ]
    });

    batch = await selectFixedDiscoveryWords(10);

    expect(batch.sourceList?.name).toBe(level0.name);
    expect(batch.words.map((word) => word.word)).toEqual(['buenos dias']);
  });
});
