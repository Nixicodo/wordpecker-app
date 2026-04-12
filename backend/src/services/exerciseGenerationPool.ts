import { shuffleArray } from '../utils/arrayUtils';
import { selectScheduledWords } from './learningProgress';
import { ScheduledWord } from './learningScheduler';

export const ACTIVE_GENERATION_WORD_COUNT = 5;
export const EXTRA_DISTRACTOR_COUNT = 15;

export function buildGenerationWordPool(
  candidates: ScheduledWord[],
  activeCount = ACTIVE_GENERATION_WORD_COUNT,
  extraDistractorCount = EXTRA_DISTRACTOR_COUNT
) {
  const scheduledWords = candidates.slice(0, activeCount);
  const scheduledWordIds = new Set(scheduledWords.map((word) => word.id));
  const extraDistractors = shuffleArray(
    candidates.filter((word) => !scheduledWordIds.has(word.id))
  ).slice(0, Math.max(0, extraDistractorCount));

  return {
    scheduledWords,
    extraDistractors,
    generationPool: [...scheduledWords, ...extraDistractors]
  };
}

export async function selectGenerationWordPool(
  userId: string,
  listId: string,
  activeCount = ACTIVE_GENERATION_WORD_COUNT,
  extraDistractorCount = EXTRA_DISTRACTOR_COUNT,
  excludedWordIds: string[] = []
) {
  const candidates = await selectScheduledWords(userId, listId, activeCount, Number.MAX_SAFE_INTEGER);
  const excludedWordIdSet = new Set(excludedWordIds);
  const filteredCandidates = excludedWordIds.length
    ? candidates.filter((candidate) => !excludedWordIdSet.has(candidate.id))
    : candidates;

  return buildGenerationWordPool(filteredCandidates, activeCount, extraDistractorCount);
}
