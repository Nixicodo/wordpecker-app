const PUNCTUATION_VARIANTS = /[，、﹐﹑]/g;
const SENTENCE_PUNCTUATION_VARIANTS = /[。．｡]/g;
const QUESTION_PUNCTUATION_VARIANTS = /[？]/g;
const EXCLAMATION_PUNCTUATION_VARIANTS = /[！]/g;
const COLON_PUNCTUATION_VARIANTS = /[：]/g;
const SEMICOLON_PUNCTUATION_VARIANTS = /[；]/g;
const ELLIPSIS_VARIANTS = /…/g;
const DASH_VARIANTS = /[\u2012\u2013\u2014\u2015]/g;
const PUNCTUATION_WITH_OPTIONAL_SPACES = /\s*([,.;:!?¿¡'"()\-])\s*/g;
const MEANING_ALTERNATIVE_DELIMITERS = /\s*(?:\/|／|;|；|、|\|)\s*/g;
const WRAPPING_QUOTES_AND_BRACKETS = /^[\s"'`“”‘’「」『』《》〈〉【】\[\](){}<>]+|[\s"'`“”‘’「」『』《》〈〉【】\[\](){}<>]+$/g;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff]/;

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

const removeDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeMeaningTokenForComparison = (value: string) => (
  normalizeAnswerForComparison(value.replace(WRAPPING_QUOTES_AND_BRACKETS, '').trim())
);

const collectMeaningTokenVariants = (value: string): string[] => {
  const baseToken = normalizeMeaningTokenForComparison(value);
  if (!baseToken) {
    return [];
  }

  const variants = new Set<string>([baseToken]);

  if (CJK_CHARACTER_PATTERN.test(baseToken) && baseToken.endsWith('的') && baseToken.length > 1) {
    variants.add(baseToken.slice(0, -1).trim());
  }

  if (baseToken.startsWith('to ') && baseToken.length > 3) {
    variants.add(baseToken.slice(3).trim());
  }

  const commaIndex = baseToken.indexOf(',');
  if (commaIndex > 0 && !CJK_CHARACTER_PATTERN.test(baseToken)) {
    variants.add(baseToken.slice(0, commaIndex).trim());
  }

  return Array.from(variants).filter(Boolean);
};

const splitTopLevelMeaningSegments = (value: string) => {
  const normalized = value.normalize('NFKC');
  const parentheticalSegments: string[] = [];
  let outsideParentheses = '';
  let currentParenthetical = '';
  let depth = 0;

  for (const character of normalized) {
    if (character === '(' || character === '（') {
      if (depth === 0) {
        outsideParentheses += ' ';
      } else {
        currentParenthetical += character;
      }
      depth += 1;
      continue;
    }

    if (character === ')' || character === '）') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) {
          parentheticalSegments.push(currentParenthetical);
          currentParenthetical = '';
        } else {
          currentParenthetical += character;
        }
      } else {
        outsideParentheses += character;
      }
      continue;
    }

    if (depth > 0) {
      currentParenthetical += character;
    } else {
      outsideParentheses += character;
    }
  }

  return [
    normalized,
    outsideParentheses,
    ...parentheticalSegments,
  ].filter((segment) => segment.trim().length > 0);
};

export const extractMeaningAnswerCandidates = (correctAnswer: string): string[] => {
  if (!correctAnswer?.trim()) {
    return [];
  }

  const candidates = new Set<string>();
  const segments = splitTopLevelMeaningSegments(correctAnswer);

  for (const segment of segments) {
    for (const variant of collectMeaningTokenVariants(segment)) {
      candidates.add(variant);
    }

    for (const token of segment.split(MEANING_ALTERNATIVE_DELIMITERS)) {
      for (const variant of collectMeaningTokenVariants(token)) {
        candidates.add(variant);
      }
    }
  }

  return Array.from(candidates);
};

export const isDeterministicallyCorrectAnswer = (userAnswer: string, correctAnswer: string) => {
  if (!userAnswer?.trim() || !correctAnswer?.trim()) {
    return false;
  }

  const normalizedUser = normalizeAnswerForComparison(userAnswer);
  const normalizedCorrect = normalizeAnswerForComparison(correctAnswer);

  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  const unaccentedCorrect = removeDiacritics(normalizedCorrect);
  return normalizedUser === unaccentedCorrect;
};

export const isDeterministicallyCorrectMeaningAnswer = (userAnswer: string, correctAnswer: string) => {
  if (!userAnswer?.trim() || !correctAnswer?.trim()) {
    return false;
  }

  const acceptedCandidates = extractMeaningAnswerCandidates(correctAnswer);
  if (!acceptedCandidates.length) {
    return false;
  }

  const acceptedCandidateSet = new Set(acceptedCandidates);
  const acceptedCandidateWithoutDiacritics = new Set(
    acceptedCandidates.map((candidate) => removeDiacritics(candidate))
  );

  for (const userCandidate of collectMeaningTokenVariants(userAnswer)) {
    if (
      acceptedCandidateSet.has(userCandidate)
      || acceptedCandidateWithoutDiacritics.has(removeDiacritics(userCandidate))
    ) {
      return true;
    }
  }

  return false;
};
