const PUNCTUATION_VARIANTS = /[，、]/g;
const SENTENCE_PUNCTUATION_VARIANTS = /[。]/g;
const QUESTION_PUNCTUATION_VARIANTS = /[？]/g;
const EXCLAMATION_PUNCTUATION_VARIANTS = /[！]/g;
const COLON_PUNCTUATION_VARIANTS = /[：]/g;
const SEMICOLON_PUNCTUATION_VARIANTS = /[；]/g;
const ELLIPSIS_VARIANTS = /…/g;
const DASH_VARIANTS = /[\u2012\u2013\u2014\u2015]/g;
const PUNCTUATION_WITH_OPTIONAL_SPACES = /\s*([,.;:!?¿¡'"()\-])\s*/g;

export const normalizeAnswerForComparison = (value: string) => (
  value
    .normalize('NFKC')
    .replace(PUNCTUATION_VARIANTS, ',')
    .replace(SENTENCE_PUNCTUATION_VARIANTS, '.')
    .replace(QUESTION_PUNCTUATION_VARIANTS, '?')
    .replace(EXCLAMATION_PUNCTUATION_VARIANTS, '!')
    .replace(COLON_PUNCTUATION_VARIANTS, ':')
    .replace(SEMICOLON_PUNCTUATION_VARIANTS, ';')
    .replace(ELLIPSIS_VARIANTS, '...')
    .replace(DASH_VARIANTS, '-')
    .replace(PUNCTUATION_WITH_OPTIONAL_SPACES, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
);

export const isDeterministicallyCorrectAnswer = (userAnswer: string, correctAnswer: string) => {
  if (!userAnswer?.trim() || !correctAnswer?.trim()) {
    return false;
  }

  return normalizeAnswerForComparison(userAnswer) === normalizeAnswerForComparison(correctAnswer);
};
