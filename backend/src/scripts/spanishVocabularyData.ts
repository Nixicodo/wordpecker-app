import fs from 'fs';
import path from 'path';

export type SpanishVocabularyWord = {
  id: number;
  spanish: string;
  english: string;
  chinese: string;
  partOfSpeech: string;
  level: number;
  sourceFile: string;
};

type SourceWord = {
  id: number;
  spanish: string;
  english: string;
  chinese?: string;
};

type SourceGroup = {
  region: string;
  partOfSpeech: string;
  level: number;
  words: SourceWord[];
};

export const getSpanishVocabularyDataDir = () =>
  path.resolve(process.cwd(), 'data', 'imports', 'spanish-vocabulary', 'word-lists');

export const getSpanishVocabularyLevelTag = (level: number) => {
  if (level === 0) {
    return 'Pre-A1';
  }
  if (level >= 1 && level <= 3) {
    return 'A1';
  }
  if (level >= 4 && level <= 6) {
    return 'A2';
  }
  if (level >= 7 && level <= 10) {
    return 'B1';
  }
  throw new Error(`Unsupported level: ${level}`);
};

export const buildSpanishVocabularyListName = (level: number) =>
  `西语3k词-Level${level}-${getSpanishVocabularyLevelTag(level)}`;

export const getManagedSpanishVocabularyListNames = () =>
  Array.from({ length: 11 }, (_, level) => buildSpanishVocabularyListName(level));

export const formatTrilingualMeaning = (chinese: string, english: string) =>
  `${chinese}（${english}）`;

export const loadSpanishVocabularyLevels = (
  dataDir = getSpanishVocabularyDataDir()
): Map<number, SpanishVocabularyWord[]> => {
  const files = fs
    .readdirSync(dataDir)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  const levels = new Map<number, SpanishVocabularyWord[]>();

  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const groups = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as SourceGroup[];

    for (const group of groups) {
      const current = levels.get(group.level) || [];

      current.push(
        ...group.words.map((word) => ({
          id: word.id,
          spanish: word.spanish.trim(),
          english: word.english.trim(),
          chinese: word.chinese?.trim() || '',
          partOfSpeech: group.partOfSpeech,
          level: group.level,
          sourceFile: file
        }))
      );

      levels.set(group.level, current);
    }
  }

  return levels;
};
