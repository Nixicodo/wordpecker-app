import { ExerciseResult, ExerciseResultType, ExerciseWithId } from '../../agents/exercise-agent/schemas';
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

export class QuizAgentService {
  private buildCacheKey(
    words: Array<{id: string, value: string, meaning: string}>,
    context: string,
    questionTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): string {
    return JSON.stringify({
      kind: 'quiz',
      context,
      baseLanguage,
      targetLanguage,
      questionTypes: [...questionTypes].sort(),
      words: words.map((word) => ({
        id: word.id,
        value: word.value,
        meaning: word.meaning,
      })),
    });
  }

  private async generateQuestionsWithAi(
    words: Array<{id: string, value: string, meaning: string}>,
    context: string,
    questionTypes: string[],
    baseLanguage: string,
    targetLanguage: string,
  ): Promise<ExerciseWithId[]> {
    const wordsContext = words.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const prompt = `Create quiz questions for these ${targetLanguage} vocabulary words for ${baseLanguage}-speaking learners:

${wordsContext}

Learning Context: "${context}"

Use these question types: ${questionTypes.join(', ')}
Create exactly ${words.length} questions (one per word).
Mix the directions across the set:
- Some questions must be target_to_base, where the learner interprets the ${targetLanguage} word in ${baseLanguage}
- Some questions must be base_to_target, where the learner sees a ${baseLanguage} meaning and identifies the ${targetLanguage} word
Do not make every question the same direction.`;

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
      'Quiz generation timed out',
    );

    return result.exercises.map(exercise => {
      const matchingWord = words.find(w => w.value === exercise.word);
      return {
        ...exercise,
        wordId: matchingWord?.id || null
      };
    });
  }

  async generateQuestions(
    words: Array<{id: string, value: string, meaning: string}>, 
    context: string, 
    questionTypes: string[],
    baseLanguage: string,
    targetLanguage: string
  ): Promise<ExerciseWithId[]> {
    const cacheKey = this.buildCacheKey(words, context, questionTypes, baseLanguage, targetLanguage);

    return generationCache.getOrCreate(cacheKey, async () => {
      try {
        return await this.generateQuestionsWithAi(words, context, questionTypes, baseLanguage, targetLanguage);
      } catch (error) {
        console.error('Quiz generation fell back to local generator:', error);
        return generateLocalExercises(words, context, questionTypes);
      }
    }, CACHE_TTL_MS);
  }
}

export const quizAgentService = new QuizAgentService();
