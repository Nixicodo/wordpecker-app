import { connectDB, closeDB } from '../config/mongodb';
import { Word } from '../api/words/model';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';
import { formatTrilingualMeaning, loadSpanishVocabularyLevels } from './spanishVocabularyData';
import { assertMeaningEncoding, extractPlaceholderMeaningEnglish } from '../utils/meaningEncoding';

const manualMeaningByValue: Record<string, string> = {
  'papá': '\u7238\u7238\uFF08dad\uFF09',
  'mamá': '\u5988\u5988\uFF08mom\uFF09',
  'policía': '\u8b66\u5bdf\uFF08police\uFF09',
  'avión': '\u98de\u673a\uFF08airplane\uFF09',
  'camión': '\u516c\u4ea4\u8f66\uFF08bus\uFF09',
  'estación': '\u8f66\u7ad9\uFF08station\uFF09',
  'teléfono': '\u7535\u8bdd\uFF08telephone\uFF09',
  'música': '\u97f3\u4e50\uFF08music\uFF09'
};

const buildSourceMeaningByValue = () => {
  const levels = loadSpanishVocabularyLevels();
  const sourceMeaningByValue = new Map<string, Map<string, string>>();

  for (const entries of levels.values()) {
    for (const entry of entries) {
      const normalizedValue = entry.spanish.toLowerCase().trim();
      const meaningsByEnglish = sourceMeaningByValue.get(normalizedValue) || new Map<string, string>();
      meaningsByEnglish.set(entry.english.trim(), formatTrilingualMeaning(entry.chinese, entry.english));
      sourceMeaningByValue.set(normalizedValue, meaningsByEnglish);
    }
  }

  return sourceMeaningByValue;
};

const run = async () => {
  await connectDB(1, 100);

  try {
    const sourceMeaningByValue = buildSourceMeaningByValue();
    const words = await Word.find({ 'listMemberships.meaning': /\?/u });
    let repairedMemberships = 0;

    for (const word of words) {
      let changed = false;
      const sourceMeanings = sourceMeaningByValue.get(word.value.toLowerCase().trim()) || new Map<string, string>();

      for (const membership of word.listMemberships) {
        const english = extractPlaceholderMeaningEnglish(membership.meaning);
        if (!english) {
          continue;
        }

        const repairedMeaning =
          sourceMeanings.get(english) ||
          manualMeaningByValue[word.value] ||
          word.listMemberships.find((item) => item !== membership && !extractPlaceholderMeaningEnglish(item.meaning))
            ?.meaning;

        if (!repairedMeaning) {
          throw new Error(`No repair mapping found for "${word.value}" -> "${membership.meaning}"`);
        }

        assertMeaningEncoding(repairedMeaning);
        membership.meaning = repairedMeaning;
        membership.updatedAt = new Date();
        repairedMemberships += 1;
        changed = true;
      }

      if (changed) {
        await word.save();
      }
    }

    await persistLearningSnapshot();
    const refreshedWords = await Word.find({ 'listMemberships.meaning': /\?/u }).lean();
    const remainingPlaceholders = refreshedWords.reduce(
      (count, word) =>
        count +
        (word.listMemberships || []).filter((membership) => Boolean(extractPlaceholderMeaningEnglish(membership.meaning)))
          .length,
      0
    );

    console.log(
      JSON.stringify(
        {
          repairedMemberships,
          remainingPlaceholders
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
