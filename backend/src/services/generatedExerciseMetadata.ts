import { ExerciseType, ExerciseWithId } from '../agents/exercise-agent/schemas';

type GenerationWord = {
  id: string;
  value: string;
  meaning: string;
  challengeScore?: number;
};

type WordSummary = {
  id: string;
  value: string;
  meaning: string;
};

const normalizeText = (value: string) => value.trim();

const collectWordIdsByTexts = (
  texts: string[],
  candidateWords: GenerationWord[]
) => {
  if (!texts.length) {
    return [];
  }

  const normalizedTexts = new Set(texts.map(normalizeText));
  return candidateWords
    .filter((candidate) => (
      normalizedTexts.has(normalizeText(candidate.value)) ||
      normalizedTexts.has(normalizeText(candidate.meaning))
    ))
    .map((candidate) => candidate.id);
};

const dedupeWordIds = (wordIds: Array<string | null | undefined>) => (
  Array.from(new Set(wordIds.filter((wordId): wordId is string => Boolean(wordId))))
);

const buildExposedWords = (
  wordIds: string[],
  candidateWords: GenerationWord[]
): WordSummary[] => {
  const candidateById = new Map(candidateWords.map((candidate) => [candidate.id, candidate]));
  return wordIds
    .map((wordId) => candidateById.get(wordId))
    .filter((candidate): candidate is GenerationWord => Boolean(candidate))
    .map((candidate) => ({
      id: candidate.id,
      value: candidate.value,
      meaning: candidate.meaning
    }));
};

export const annotateGeneratedExercises = (
  exercises: Array<ExerciseType & Partial<Pick<ExerciseWithId, 'wordId' | 'wordIds' | 'exposedWordIds' | 'exposedWords'>>>,
  scheduledWords: GenerationWord[],
  distractorWords: GenerationWord[],
  adjustDifficulty: (difficulty: ExerciseWithId['difficulty'], challengeScore?: number) => ExerciseWithId['difficulty']
) => {
  const allKnownWords = [...scheduledWords, ...distractorWords];

  return exercises.map((exercise) => {
    const matchingWord = scheduledWords.find((candidate) => candidate.value === exercise.word);
    const pairWordIds = exercise.type === 'matching' && exercise.pairs
      ? exercise.pairs
          .map((pair) => allKnownWords.find((candidate) => candidate.value === pair.word)?.id)
      : [];
    const optionWordIds = exercise.options
      ? collectWordIdsByTexts(exercise.options, allKnownWords)
      : [];
    const exposedWordIds = dedupeWordIds([
      matchingWord?.id ?? exercise.wordId,
      ...pairWordIds,
      ...optionWordIds,
      ...(exercise.wordIds || []),
      ...(exercise.exposedWordIds || [])
    ]);

    return {
      ...exercise,
      difficulty: adjustDifficulty(exercise.difficulty, matchingWord?.challengeScore),
      wordId: matchingWord?.id || exercise.wordId || null,
      wordIds: pairWordIds.length ? dedupeWordIds(pairWordIds) : exercise.wordIds,
      exposedWordIds,
      exposedWords: buildExposedWords(exposedWordIds, allKnownWords)
    };
  });
};
