import { z } from 'zod';

export const Question = z.object({
  type: z.enum(['multiple_choice', 'fill_blank', 'true_false', 'matching', 'sentence_completion']),
  direction: z.enum(['target_to_base', 'base_to_target']).describe('Whether the question asks from target language to base language, or the reverse'),
  word: z.string().describe('The target word'),
  question: z.string().describe('The quiz question'),
  options: z.array(z.string()).nullable().describe('Answer options (null if not applicable)'),
  optionLabels: z.array(z.string()).nullable().describe('Labels for options (null if not applicable)'),
  correctAnswer: z.string().describe('The correct answer'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Question difficulty'),
  hint: z.string().nullable().describe('Optional hint (null if not applicable)'),
  feedback: z.string().nullable().describe('Feedback after answering (null if not applicable)')
});

export const QuizResult = z.object({
  questions: z.array(Question).describe('Array of quiz questions')
});

export type QuizResultType = z.infer<typeof QuizResult>;
export type QuestionType = z.infer<typeof Question>;

// Type for questions with wordId added after generation
export type QuestionWithId = QuestionType & { wordId: string | null };
