import { buildGenerationWordPool } from '../services/exerciseGenerationPool';

describe('buildGenerationWordPool', () => {
  const candidates = Array.from({ length: 24 }, (_, index) => ({
    id: `${index + 1}`,
    value: `word-${index + 1}`,
    meaning: `meaning-${index + 1}`,
    state: {
      dueAt: new Date().toISOString(),
      stability: 1,
      difficulty: 1,
      reviewCount: 0,
      lapseCount: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      retrievability: 0.5,
      status: 'learning' as const,
      urgency: 1 - index * 0.01,
      challengeScore: 0.2,
      behaviorRisk: 0,
      hintUsageRate: 0,
      averageResponseTimeMs: undefined
    }
  }));

  it('keeps the first active words and appends random distractors from the remaining tree words', () => {
    const { scheduledWords, extraDistractors, generationPool } = buildGenerationWordPool(candidates, 5, 15);

    expect(scheduledWords).toHaveLength(5);
    expect(extraDistractors).toHaveLength(15);
    expect(extraDistractors.every((word) => !['1', '2', '3', '4', '5'].includes(word.id))).toBe(true);
    expect(generationPool).toHaveLength(20);
    expect(generationPool.slice(0, 5).map((word) => word.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(generationPool.slice(5).every((word) => !['1', '2', '3', '4', '5'].includes(word.id))).toBe(true);
  });

  it('skips excluded words when building the next batch candidate pool', () => {
    const excludedWordIds = new Set(['1', '2', '3', '4', '5']);
    const filteredCandidates = candidates.filter((candidate) => !excludedWordIds.has(candidate.id));
    const { scheduledWords, generationPool } = buildGenerationWordPool(filteredCandidates, 5, 15);

    expect(scheduledWords.map((word) => word.id)).toEqual(['6', '7', '8', '9', '10']);
    expect(generationPool.every((word) => !excludedWordIds.has(word.id))).toBe(true);
  });
});
