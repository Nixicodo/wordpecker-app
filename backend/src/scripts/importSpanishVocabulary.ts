import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/mongodb';
import { WordList } from '../api/lists/model';
import { Word } from '../api/words/model';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';
import {
  buildSpanishVocabularyListName,
  formatTrilingualMeaning,
  getManagedSpanishVocabularyListNames,
  getSpanishVocabularyLevelTag,
  loadSpanishVocabularyLevels
} from './spanishVocabularyData';

const buildListDescription = (level: number, count: number) =>
  `来自 GreenAnts/Spanish-Vocabulary 的西语频率词表，当前仓库现有 ${count} 条词，等级 ${level} 对应 ${getSpanishVocabularyLevelTag(level)}。`;

const buildListContext = (level: number) =>
  `Mexican Spanish frequency vocabulary level ${level} (${getSpanishVocabularyLevelTag(level)})`;

const clearManagedListContexts = async () => {
  const managedNames = getManagedSpanishVocabularyListNames();
  const managedLists = await WordList.find({ name: { $in: managedNames } }).lean();
  const managedIds = managedLists.map((list) => list._id);

  if (managedIds.length === 0) {
    return;
  }

  await Word.updateMany(
    { 'listMemberships.listId': { $in: managedIds } },
    { $pull: { listMemberships: { listId: { $in: managedIds } } } }
  );

  await Word.deleteMany({ listMemberships: { $size: 0 } });
};

const upsertWordIntoList = async (listId: mongoose.Types.ObjectId, value: string, meaning: string) => {
  const normalizedValue = value.toLowerCase().trim();
  const existingWord = await Word.findOne({ value: normalizedValue });

  if (!existingWord) {
    await Word.create({
      value: normalizedValue,
      listMemberships: [
        {
          listId,
          meaning,
          addedAt: new Date(),
          updatedAt: new Date()
        }
      ]
    });
    return;
  }

  const membership = existingWord.listMemberships.find((item) => item.listId.toString() === listId.toString());
  if (membership) {
    membership.meaning = meaning;
    membership.updatedAt = new Date();
    await existingWord.save();
    return;
  }

  existingWord.listMemberships.push({
    listId,
    meaning,
    addedAt: new Date(),
    updatedAt: new Date()
  });
  await existingWord.save();
};

const run = async () => {
  await connectDB(1, 100);

  try {
    const levels = loadSpanishVocabularyLevels();
    await clearManagedListContexts();

    let importedLists = 0;
    let importedWords = 0;

    for (const level of Array.from(levels.keys()).sort((a, b) => a - b)) {
      const entries = levels.get(level) || [];
      const name = buildSpanishVocabularyListName(level);

      const list = await WordList.findOneAndUpdate(
        { name },
        {
          name,
          description: buildListDescription(level, entries.length),
          context: buildListContext(level),
          updated_at: new Date()
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      importedLists += 1;

      for (const entry of entries) {
        await upsertWordIntoList(
          list._id,
          entry.spanish,
          formatTrilingualMeaning(entry.chinese, entry.english)
        );
        importedWords += 1;
      }
    }

    await persistLearningSnapshot();
    console.log(
      JSON.stringify(
        {
          importedLists,
          importedWords,
          managedListNames: getManagedSpanishVocabularyListNames()
        },
        null,
        2
      )
    );
  } finally {
    await closeDB();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
