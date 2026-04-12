import { Exercise, Question, Word } from '../types';

export type ExposureWord = {
  id: string;
  value: string;
  meaning: string;
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

      return {
        id: matchedWord?.id || `${pair.word}-${index}`,
        value: matchedWord?.value || pair.word,
        meaning: matchedWord?.meaning || pair.definition
      };
    }));
  }

  if (question.options?.length) {
    const optionWords = question.options.map((option) => {
      const wordMatch = wordsByValue.get(normalizeText(option));
      if (wordMatch) {
        return {
          id: wordMatch.id,
          value: wordMatch.value,
          meaning: wordMatch.meaning
        };
      }

      const meaningMatch = wordsByMeaning.get(normalizeText(option));
      if (meaningMatch) {
        return {
          id: meaningMatch.id,
          value: meaningMatch.value,
          meaning: meaningMatch.meaning
        };
      }

      return null;
    }).filter((word): word is ExposureWord => Boolean(word));

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
      meaning: primaryWord.meaning
    }]);
  }

  if (question.wordId) {
    return mergeWithExisting([{
      id: question.wordId,
      value: question.word,
      meaning: ''
    }]);
  }

  return mergeWithExisting([]);
};
