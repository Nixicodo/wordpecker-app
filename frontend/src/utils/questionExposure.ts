import { Exercise, Question, Word } from '../types';

export type ExposureWord = {
  id: string;
  value: string;
  meaning: string;
  phonetic?: string;
  detailedExplanation?: string;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const dedupeExposureWords = (words: ExposureWord[]) => {
  const seenWordIds = new Set<string>();
  return words.filter((word) => {
    if (seenWordIds.has(word.id)) {
      return false;
    }

    seenWordIds.add(word.id);
    return true;
  });
};

const toExposureWord = (word: {
  id: string;
  value: string;
  meaning: string;
  phonetic?: string;
  detailedExplanation?: string;
}): ExposureWord => ({
  id: word.id,
  value: word.value,
  meaning: word.meaning,
  phonetic: word.phonetic,
  detailedExplanation: word.detailedExplanation
});

export const resolveQuestionExposureWords = (
  question: Exercise | Question,
  listWords: Word[]
): ExposureWord[] => {
  const mergeWithExisting = (derivedWords: ExposureWord[]) => (
    dedupeExposureWords([...(derivedWords || []), ...((question.exposedWords || []) as ExposureWord[])])
  );

  const wordsByValue = new Map(listWords.map((word) => [normalizeText(word.value), word]));
  const wordsByMeaning = new Map(listWords.map((word) => [normalizeText(word.meaning), word]));

  if (question.type === 'matching' && question.pairs?.length) {
    return mergeWithExisting(question.pairs.map((pair, index) => {
      const matchedWord = wordsByValue.get(normalizeText(pair.word));

      return toExposureWord({
        id: matchedWord?.id || `${pair.word}-${index}`,
        value: matchedWord?.value || pair.word,
        meaning: matchedWord?.meaning || pair.definition,
        phonetic: matchedWord?.phonetic,
        detailedExplanation: matchedWord?.detailedExplanation
      });
    }));
  }

  if (question.options?.length) {
    const optionWords = question.options.map((option) => {
      const wordMatch = wordsByValue.get(normalizeText(option));
      if (wordMatch) {
        return toExposureWord({
          id: wordMatch.id,
          value: wordMatch.value,
          meaning: wordMatch.meaning,
          phonetic: wordMatch.phonetic,
          detailedExplanation: wordMatch.detailedExplanation
        });
      }

      const meaningMatch = wordsByMeaning.get(normalizeText(option));
      if (meaningMatch) {
        return toExposureWord({
          id: meaningMatch.id,
          value: meaningMatch.value,
          meaning: meaningMatch.meaning,
          phonetic: meaningMatch.phonetic,
          detailedExplanation: meaningMatch.detailedExplanation
        });
      }

      return null;
    }).filter((word): word is ExposureWord => word !== null);

    if (optionWords.length > 0) {
      return mergeWithExisting(optionWords);
    }
  }

  const primaryWord = question.wordId
    ? listWords.find((word) => word.id === question.wordId)
    : listWords.find((word) => normalizeText(word.value) === normalizeText(question.word));

  if (primaryWord) {
    return mergeWithExisting([{
      id: primaryWord.id,
      value: primaryWord.value,
      meaning: primaryWord.meaning,
      phonetic: primaryWord.phonetic,
      detailedExplanation: primaryWord.detailedExplanation
    }]);
  }

  if (question.wordId) {
    return mergeWithExisting([{
      id: question.wordId,
      value: question.word,
      meaning: '',
      phonetic: undefined,
      detailedExplanation: undefined
    }]);
  }

  return mergeWithExisting([]);
};
