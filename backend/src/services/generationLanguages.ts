import { UserLanguages } from '../utils/getUserLanguages';

type GenerationWord = {
  value: string;
  meaning?: string;
};

const CHINESE_CHAR_PATTERN = /[\u3400-\u9fff]/u;
const SPANISH_CHAR_PATTERN = /[áéíóúñü¿¡]/i;
const LEGACY_ENGLISH_PATTERN = /^(en|english)$/i;
const SPANISH_HINT_WORDS = new Set([
  'a',
  'alli',
  'allá',
  'allí',
  'buenas',
  'caer',
  'con',
  'de',
  'el',
  'en',
  'estar',
  'guerra',
  'haber',
  'la',
  'más',
  'partido',
  'por',
  'que',
  'ser',
  'sin',
  'tener',
  'volver',
  'y'
]);

const normalizeWord = (value: string) => value.trim().toLowerCase();

const looksLikeSpanishVocabulary = (word: string) => {
  const normalized = normalizeWord(word);
  return SPANISH_CHAR_PATTERN.test(word) || SPANISH_HINT_WORDS.has(normalized);
};

export const resolveGenerationLanguages = (
  languages: UserLanguages,
  words: GenerationWord[]
): UserLanguages => {
  const hasChineseMeanings = words.some((word) => CHINESE_CHAR_PATTERN.test(word.meaning || ''));
  const hasSpanishVocabulary = words.some((word) => looksLikeSpanishVocabulary(word.value));

  return {
    baseLanguage: LEGACY_ENGLISH_PATTERN.test(languages.baseLanguage) && hasChineseMeanings
      ? 'Simplified Chinese'
      : languages.baseLanguage,
    targetLanguage: LEGACY_ENGLISH_PATTERN.test(languages.targetLanguage) && hasSpanishVocabulary
      ? 'Latin American Spanish'
      : languages.targetLanguage
  };
};
