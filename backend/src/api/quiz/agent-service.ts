import { ExerciseResult, ExerciseResultType, ExerciseWithId } from '../../agents/exercise-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import * as fs from 'fs';
import * as path from 'path';

const exercisePrompt = fs.readFileSync(path.join(__dirname, '../../agents/exercise-agent/prompt.md'), 'utf-8');

export class QuizAgentService {
  async generateQuestions(
    words: Array<{id: string, value: string, meaning: string}>, 
    context: string, 
    questionTypes: string[]
  ): Promise<ExerciseWithId[]> {
    const wordsContext = words.map(w => `${w.value}: ${w.meaning}`).join('\n');
    const prompt = `Create quiz questions for these vocabulary words:

${wordsContext}

Learning Context: "${context}"

Use these question types: ${questionTypes.join(', ')}
Create exactly ${words.length} questions (one per word).`;
    
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
    
    // Map the returned exercises back to include word IDs
    const questionsWithIds = result.exercises.map(exercise => {
      const matchingWord = words.find(w => w.value === exercise.word);
      return {
        ...exercise,
        wordId: matchingWord?.id || null
      };
    });
    
    return questionsWithIds;
  }
}

export const quizAgentService = new QuizAgentService();
