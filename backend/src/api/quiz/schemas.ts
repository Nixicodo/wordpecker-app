import { z } from 'zod';
import mongoose from 'mongoose';

export const listIdSchema = {
  params: z.object({
    listId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid list ID')
  })
};

export const updatePointsSchema = {
  ...listIdSchema,
  body: z.object({
    results: z.array(z.object({
      wordId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid word ID'),
      wordIds: z.array(z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid word ID')).optional(),
      sourceListId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid list ID').optional(),
      sourceListIdByWordId: z.record(
        z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid list ID')
      ).optional(),
      correct: z.boolean(),
      rating: z.enum(['again', 'hard', 'good', 'easy']).optional(),
      questionType: z.string().optional(),
      selfAssessedWordIds: z.array(z.string().refine(val => mongoose.Types.ObjectId.isValid(val), 'Invalid word ID')).optional(),
      responseTimeMs: z.number().nonnegative().optional(),
      usedHint: z.boolean().optional(),
      settlementKey: z.string().min(1).optional(),
      answeredAt: z.string().datetime().optional()
    }))
  })
};
