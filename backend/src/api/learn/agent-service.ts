import { ExerciseResult, ExerciseResultType, ExerciseType } from '../../agents/exercise-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import { generationCache } from '../../services/generationCache';
import { generateLocalExercises } from '../../services/localExerciseGenerator';
import * as fs from 'fs';
import * as path from 'path';

const exercisePrompt = fs.readFileSync(path.join(__dirname, '../../agents/exercise-agent/prompt.md'), 'utf-8');
const GENERATION_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 15 * 60 * 1000;

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
    words: Array<{id: string, value: string, meaning: string}>,
    context: string,
    exerciseTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): string {
    return JSON.stringify({
      kind: 'learn',
      context,
      baseLanguage,
      targetLanguage,
      exerciseTypes: [...exerciseTypes].sort(),
      words: words.map((word) => ({
        id: word.id,
        value: word.value,
        meaning: word.meaning,
      })),
    });
  }

  private async generateExercisesWithAi(
    words: Array<{id: string, value: string, meaning: string}>,
    context: string,
    exerciseTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): Promise<ExerciseType[]> {
    const wordsContext = words.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const prompt = `Create learning exercises for these ${targetLanguage} vocabulary words for ${baseLanguage}-speaking learners:

${wordsContext}

Learning Context: "${context}"

Use these exercise types: ${exerciseTypes.join(', ')}
Create exactly ${words.length} exercises (one per word).`;

    const result = await withTimeout(
      generateStructuredResult<ExerciseResultType>({
        systemPrompt: exercisePrompt,
        userPrompt: prompt,
        schema: ExerciseResult,
        schemaHint: `{
  "exercises": Array<{
    "type": "multiple_choice" | "fill_blank" | "true_false" | "sentence_completion" | "matching",
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

    return result.exercises;
  }

  async generateExercises(
    words: Array<{id: string, value: string, meaning: string}>, 
    context: string, 
    exerciseTypes: string[], 
    baseLanguage: string, 
    targetLanguage: string
  ): Promise<ExerciseType[]> {
    const cacheKey = this.buildCacheKey(words, context, exerciseTypes, baseLanguage, targetLanguage);

    return generationCache.getOrCreate(cacheKey, async () => {
      try {
        return await this.generateExercisesWithAi(words, context, exerciseTypes, baseLanguage, targetLanguage);
      } catch (error) {
        console.error('Learn exercise generation fell back to local generator:', error);
        return generateLocalExercises(words, context, exerciseTypes);
      }
    }, CACHE_TTL_MS);
  }
}

export const learnAgentService = new LearnAgentService();
