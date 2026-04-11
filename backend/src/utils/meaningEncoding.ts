const countMatches = (value: string, pattern: RegExp) => (value.match(pattern) || []).length;

const PLACEHOLDER_MEANING_PATTERN = /^\?+[\uFF08(](.+)[\uFF09)]$/u;

export const extractPlaceholderMeaningEnglish = (meaning?: string | null) => {
  if (!meaning) {
    return null;
  }

  const trimmed = meaning.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(PLACEHOLDER_MEANING_PATTERN);
  return match?.[1]?.trim() || null;
};

export const isLikelyCorruptedMeaning = (meaning?: string | null) => {
  if (!meaning) {
    return false;
  }

  const trimmed = meaning.trim();
  if (!trimmed) {
    return false;
  }

  if (PLACEHOLDER_MEANING_PATTERN.test(trimmed)) {
    return true;
  }

  if (trimmed.includes('\uFFFD')) {
    return true;
  }

  const questionMarkCount = countMatches(trimmed, /\?/g);
  if (questionMarkCount < 2) {
    return false;
  }

  const latinLetterCount = countMatches(trimmed, /[A-Za-z]/g);
  if (latinLetterCount === 0) {
    return false;
  }

  const nonAsciiCount = countMatches(trimmed, /[^\x00-\x7F]/g);
  const hasRepeatedQuestionMarks = /\?{2,}/.test(trimmed);
  const hasQuestionMarksAroundSeparators = /(\?\/|\/\?|\?[\(\uFF08]|[\)\uFF09]\?)/u.test(trimmed);
  const hasQuestionMarksNextToWords = /(?:^|[^A-Za-z])\?[A-Za-z]|[A-Za-z]\?(?:$|[^A-Za-z])/.test(trimmed);

  return (
    (hasRepeatedQuestionMarks || hasQuestionMarksAroundSeparators || hasQuestionMarksNextToWords) &&
    nonAsciiCount <= questionMarkCount + 2
  );
};

export const assertMeaningEncoding = (meaning?: string | null) => {
  if (isLikelyCorruptedMeaning(meaning)) {
    throw new Error('Meaning appears to contain encoding corruption. Please re-enter it using UTF-8 text.');
  }
};
