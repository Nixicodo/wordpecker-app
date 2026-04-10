import { ExerciseResult, ExerciseResultType, ExerciseType } from '../../agents/exercise-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import * as fs from 'fs';
import * as path from 'path';

const exercisePrompt = fs.readFileSync(path.join(__dirname, '../../agents/exercise-agent/prompt.md'), 'utf-8');

export class LearnAgentService {
  async generateExercises(
    words: Array<{id: string, value: string, meaning: string}>, 
    context: string, 
    exerciseTypes: string[], 
    baseLanguage: string, 
    targetLanguage: string
  ): Promise<ExerciseType[]> {
    const wordsContext = words.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const prompt = `Create learning exercises for these ${targetLanguage} vocabulary words for ${baseLanguage}-speaking learners:

${wordsContext}

Learning Context: "${context}"

Use these exercise types: ${exerciseTypes.join(', ')}
Create exactly ${words.length} exercises (one per word).`;
    
    const result = await generateStructuredResult<ExerciseResultType>({
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
    });
    return result.exercises;
  }
}

export const learnAgentService = new LearnAgentService();
