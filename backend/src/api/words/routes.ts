import { Router } from 'express';
import { validate } from 'echt';
import { openaiRateLimiter } from '../../middleware/rateLimiter';
import { WordList } from '../lists/model';
import { Word, IWord } from './model';
import { wordAgentService } from './agent-service';
import mongoose from 'mongoose';
import { getUserLanguages } from '../../utils/getUserLanguages';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import { assertMeaningEncoding } from '../../utils/meaningEncoding';
import { 
  listIdSchema, 
  addWordSchema, 
  bulkAddWordsSchema,
  wordIdSchema, 
  wordContextSchema, 
  deleteWordSchema, 
  validateAnswerSchema 
} from './schemas';

const router = Router();

const transformWord = (word: IWord, listId: string) => {
  const context = word.ownedByLists.find(ctx => ctx.listId.toString() === listId);
  return {
    id: word._id.toString(),
    value: word.value,
    meaning: context?.meaning || '',
    learnedPoint: context?.learnedPoint || 0,
    created_at: word.created_at.toISOString(),
    updated_at: word.updated_at.toISOString()
  };
};

type UserLanguages = {
  baseLanguage: string;
  targetLanguage: string;
};

const resolveDefinition = async (
  req: { headers: Record<string, string | string[] | undefined> },
  value: string,
  listContext: string,
  providedMeaning?: string,
  languages?: UserLanguages
) => {
  if (providedMeaning?.trim()) {
    const normalizedMeaning = providedMeaning.trim();
    assertMeaningEncoding(normalizedMeaning);
    return normalizedMeaning;
  }

  let resolvedLanguages = languages;
  if (!resolvedLanguages) {
    const userId = req.headers['user-id'] as string;
    if (!userId) {
      throw new Error('User ID is required');
    }
    resolvedLanguages = await getUserLanguages(userId);
  }

  const generatedMeaning = await wordAgentService.generateDefinition(
    value,
    listContext,
    resolvedLanguages.baseLanguage,
    resolvedLanguages.targetLanguage
  );

  assertMeaningEncoding(generatedMeaning);
  return generatedMeaning;
};

const addWordToList = async (listId: string, value: string, meaning: string) => {
  const normalizedValue = value.toLowerCase().trim();
  let word = await Word.findOne({ value: normalizedValue });

  if (word) {
    if (word.ownedByLists.some(ctx => ctx.listId.toString() === listId)) {
      return { status: 'duplicate' as const, word };
    }
    word.ownedByLists.push({
      listId: new mongoose.Types.ObjectId(listId),
      meaning,
      learnedPoint: 0
    });
    await word.save();
    return { status: 'linked' as const, word };
  }

  word = await Word.create({
    value: normalizedValue,
    ownedByLists: [{ listId: new mongoose.Types.ObjectId(listId), meaning, learnedPoint: 0 }]
  });
  return { status: 'created' as const, word };
};

router.post('/:listId/words', validate(addWordSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const { word: value, meaning: providedMeaning } = req.body;

    const list = await WordList.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });

    const definition = await resolveDefinition(req, value, list.context || '', providedMeaning);
    const result = await addWordToList(listId, value, definition);

    if (result.status === 'duplicate') {
      return res.status(400).json({ message: 'Word already exists in this list' });
    }

    await WordList.findByIdAndUpdate(listId, { updated_at: new Date() });
    await persistLearningSnapshot();
    res.status(201).json({ ...transformWord(result.word, listId), _id: result.word._id });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:listId/words/bulk', validate(bulkAddWordsSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const { words } = req.body as { words: Array<{ word: string; meaning?: string }> };

    const list = await WordList.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });

    const needsGeneratedMeaning = words.some(item => !item.meaning?.trim());
    const userId = req.headers['user-id'] as string | undefined;
    let languages: UserLanguages | undefined;

    if (needsGeneratedMeaning) {
      if (!userId) {
        return res.status(400).json({ message: 'User ID is required when meaning is missing' });
      }
      languages = await getUserLanguages(userId);
    }

    const seen = new Set<string>();
    const imported: Array<ReturnType<typeof transformWord>> = [];
    const skipped: Array<{ word: string; reason: string }> = [];
    const failed: Array<{ word: string; reason: string }> = [];

    for (const item of words) {
      const originalWord = item.word.trim();
      const normalizedWord = originalWord.toLowerCase();
      if (!originalWord) {
        skipped.push({ word: originalWord, reason: 'empty_word' });
        continue;
      }

      if (seen.has(normalizedWord)) {
        skipped.push({ word: originalWord, reason: 'duplicate_in_payload' });
        continue;
      }
      seen.add(normalizedWord);

      try {
        const definition = await resolveDefinition(req, originalWord, list.context || '', item.meaning, languages);
        const result = await addWordToList(listId, originalWord, definition);

        if (result.status === 'duplicate') {
          skipped.push({ word: originalWord, reason: 'already_exists_in_list' });
          continue;
        }

        imported.push(transformWord(result.word, listId));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        failed.push({ word: originalWord, reason });
      }
    }

    if (imported.length > 0) {
      await WordList.findByIdAndUpdate(listId, { updated_at: new Date() });
      await persistLearningSnapshot();
    }

    res.status(201).json({
      imported,
      skipped,
      failed,
      summary: {
        total: words.length,
        imported: imported.length,
        skipped: skipped.length,
        failed: failed.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:listId/words', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const words = await Word.find({ 'ownedByLists.listId': listId }).lean();
    res.json(words.map(word => ({ ...transformWord(word as IWord, listId), _id: word._id })));
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:listId/words/:wordId', validate(deleteWordSchema), async (req, res) => {
  try {
    const { listId, wordId } = req.params;

    const word = await Word.findById(wordId);
    if (!word) return res.status(404).json({ message: 'Word not found' });

    word.ownedByLists = word.ownedByLists.filter(ctx => ctx.listId.toString() !== listId);
    
    if (word.ownedByLists.length === 0) {
      await Word.findByIdAndDelete(wordId);
    } else {
      await word.save();
    }

    await WordList.findByIdAndUpdate(listId, { updated_at: new Date() });
    await persistLearningSnapshot();
    res.json({ message: 'Word deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/validate-answer', validate(validateAnswerSchema), async (req: any, res) => {
  try {
    const { userAnswer, correctAnswer, context } = req.body;
    const userId = req.headers['user-id'] as string;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const result = await wordAgentService.validateAnswer(userAnswer, correctAnswer, context, baseLanguage, targetLanguage);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/word/:wordId', validate(wordIdSchema), async (req, res) => {
  try {
    const { wordId } = req.params;
    const word = await Word.findById(wordId).lean();
    if (!word) return res.status(404).json({ message: 'Word not found' });

    const contexts = await Promise.all(
      word.ownedByLists.map(async (context) => {
        const list = await WordList.findById(context.listId).lean();
        return {
          listId: context.listId.toString(),
          listName: list?.name || 'Unknown List',
          listContext: list?.context,
          meaning: context.meaning,
          learnedPoint: context.learnedPoint
        };
      })
    );

    res.json({
      id: word._id.toString(),
      value: word.value,
      contexts,
      created_at: word.created_at.toISOString(),
      updated_at: word.updated_at.toISOString()
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/word/:wordId/sentences', validate(wordContextSchema), async (req, res) => {
  try {
    const { wordId } = req.params;
    const { contextIndex } = req.body;

    const word = await Word.findById(wordId).lean();
    if (!word || contextIndex >= word.ownedByLists.length) {
      return res.status(404).json({ message: 'Word not found or invalid context' });
    }

    const wordContext = word.ownedByLists[contextIndex];
    const list = await WordList.findById(wordContext.listId).lean();
    const context = list?.context || 'General';

    const userId = req.headers['user-id'] as string;
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const sentences = await wordAgentService.generateExamples(word.value, wordContext.meaning, context, baseLanguage, targetLanguage);

    res.json({ examples: sentences });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/word/:wordId/similar', openaiRateLimiter, validate(wordContextSchema), async (req, res) => {
  try {
    const { wordId } = req.params;
    const { contextIndex } = req.body;

    const word = await Word.findById(wordId).lean();
    if (!word || contextIndex >= word.ownedByLists.length) {
      return res.status(404).json({ message: 'Word not found or invalid context' });
    }

    const wordContext = word.ownedByLists[contextIndex];
    const list = await WordList.findById(wordContext.listId).lean();
    const context = list?.context || 'General';

    const userId = req.headers['user-id'] as string;
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const similarWords = await wordAgentService.generateSimilarWords(word.value, wordContext.meaning, context, baseLanguage, targetLanguage);

    res.json({
      word: word.value,
      meaning: wordContext.meaning,
      context,
      similar_words: similarWords
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:listId/light-reading', openaiRateLimiter, validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;

    const [words, list] = await Promise.all([
      Word.find({ 'ownedByLists.listId': listId }).lean(),
      WordList.findById(listId).lean()
    ]);

    if (words.length === 0) {
      return res.status(400).json({ message: 'No words found in this list' });
    }

    const userId = req.headers['user-id'] as string;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);

    const wordsForReading = words.map(word => {
      const wordContext = word.ownedByLists.find(ctx => ctx.listId.toString() === listId);
      return { value: word.value, meaning: wordContext?.meaning || '' };
    });

    const reading = await wordAgentService.generateLightReading(wordsForReading, list?.context || 'General', baseLanguage, targetLanguage);
    res.json(reading);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router; 
