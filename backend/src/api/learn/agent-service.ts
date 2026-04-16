import { ExerciseResult, ExerciseResultType, ExerciseWithId } from '../../agents/exercise-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import { generationCache } from '../../services/generationCache';
import { generateLocalExercises } from '../../services/localExerciseGenerator';
import { annotateGeneratedExercises } from '../../services/generatedExerciseMetadata';
import * as fs from 'fs';
import * as path from 'path';

const exercisePrompt = fs.readFileSync(path.join(__dirname, '../../agents/exercise-agent/prompt.md'), 'utf-8');
const GENERATION_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const EXERCISE_PROMPT_VERSION = 'target-language-question-v2';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export class LearnAgentService {
  private buildCacheKey(
    words: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    distractorWords: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    context: string,
    exerciseTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): string {
    return JSON.stringify({
      kind: 'learn',
      promptVersion: EXERCISE_PROMPT_VERSION,
      context,
      baseLanguage,
      targetLanguage,
      exerciseTypes: [...exerciseTypes].sort(),
      words: words.map((word) => ({
        id: word.id,
        value: word.value,
        meaning: word.meaning,
        challengeScore: word.challengeScore,
      })),
      distractorWords: distractorWords.map((word) => ({
        id: word.id,
        value: word.value,
        meaning: word.meaning,
      })),
    });
  }

  private adjustDifficulty(baseDifficulty: ExerciseWithId['difficulty'], challengeScore = 0): ExerciseWithId['difficulty'] {
    if (challengeScore >= 0.72) {
      return baseDifficulty === 'easy' ? 'medium' : 'hard';
    }

    if (challengeScore >= 0.45) {
      if (baseDifficulty === 'easy') return 'medium';
      return baseDifficulty;
    }

    return baseDifficulty;
  }

  private async generateExercisesWithAi(
    words: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    distractorWords: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    context: string,
    exerciseTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): Promise<ExerciseWithId[]> {
    const allKnownWords = [...words, ...distractorWords];
    const wordsContext = words.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const distractorContext = distractorWords.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const prompt = `Create learning exercises for these ${targetLanguage} vocabulary words for ${baseLanguage}-speaking learners:

${wordsContext}

Learning Context: "${context}"

Use these exercise types: ${exerciseTypes.join(', ')}
Create exactly ${words.length} exercises (one per word).
Mix the directions across the set:
- Some exercises must be target_to_base, where the learner interprets the ${targetLanguage} word in ${baseLanguage}
- Some exercises must be base_to_target, where the learner sees a ${baseLanguage} meaning and identifies the ${targetLanguage} word
Do not make every exercise the same direction.

Distractor candidate pool:
${distractorContext}

When building multiple-choice style options, do not reuse the exact same tiny option pool for every question unless the candidate pool is genuinely too small.
If a word appears behaviorally challenging, prefer a higher exercise difficulty and stronger distractors.

Language-format requirements:
- The visible "question" text must be written in ${targetLanguage}, not in ${baseLanguage}.
- The "hint" and "feedback" should be written in ${baseLanguage}.
- For base_to_target fill_blank exercises, use a natural ${targetLanguage} sentence or prompt and leave the answer slot blank in ${targetLanguage}.
- Do not restate the full prompt in ${baseLanguage} inside the question body unless the source material itself requires it.`;

    const result = await withTimeout(
      generateStructuredResult<ExerciseResultType>({
        systemPrompt: exercisePrompt,
        userPrompt: prompt,
        schema: ExerciseResult,
        schemaHint: `{
  "exercises": Array<{
    "type": "multiple_choice" | "fill_blank" | "true_false" | "sentence_completion" | "matching",
    "direction": "target_to_base" | "base_to_target",
    "word": string,
    "question": string,
    "options": string[] | null,
    "optionLabels": string[] | null,
    "correctAnswer": string,
    "difficulty": "easy" | "medium" | "hard",
    "hint": string | null,
    "feedback": string | null,
    "pairs": Array<{ "word": string, "definition": string }> | null
  }>
}`,
        temperature: 0.7,
        maxTokens: 2400,
      }),
      GENERATION_TIMEOUT_MS,
      'Learning exercise generation timed out',
    );

    return annotateGeneratedExercises(
      result.exercises,
      words,
      distractorWords,
      (difficulty, challengeScore) => this.adjustDifficulty(difficulty, challengeScore)
    );
  }

  async generateExercises(
    words: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    distractorWords: Array<{id: string, value: string, meaning: string, challengeScore?: number}>,
    context: string, 
    exerciseTypes: string[], 
    baseLanguage: string, 
    targetLanguage: string
  ): Promise<ExerciseWithId[]> {
    const cacheKey = this.buildCacheKey(words, distractorWords, context, exerciseTypes, baseLanguage, targetLanguage);

    return generationCache.getOrCreate(cacheKey, async () => {
      try {
        return await this.generateExercisesWithAi(words, distractorWords, context, exerciseTypes, baseLanguage, targetLanguage);
      } catch (error) {
        console.error('Learn exercise generation fell back to local generator:', error);
        return generateLocalExercises(words, distractorWords, context, exerciseTypes, baseLanguage, targetLanguage);
      }
    }, CACHE_TTL_MS);
  }
}

export const learnAgentService = new LearnAgentService();
