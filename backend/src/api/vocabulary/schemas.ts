import { z } from 'zod';

export const generateWordsSchema = {
  body: z.object({
    context: z.string().min(1),
    count: z.number().min(1).max(20).default(10),
    difficulty: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate')
  })
};

export const discoveryWordsSchema = {
  body: z.object({
    count: z.number().min(1).max(20).default(15)
  })
};

export const discoveryAssessmentSchema = {
  body: z.object({
    wordId: z.string().min(1),
    sourceListId: z.string().min(1),
    assessment: z.enum(['mastered', 'familiar', 'uncertain', 'unknown'])
  })
};

export const getWordDetailsSchema = {
  body: z.object({
    word: z.string().min(1),
    context: z.string().min(1)
  })
};
