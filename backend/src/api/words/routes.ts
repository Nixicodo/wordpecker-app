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
import { LearningState } from '../learning-state/model';
import { resolveUserId } from '../../config/learning';
import { ensureLearningState, selectDueReviewWords } from '../../services/learningScheduler';
import { isDueReviewList } from '../../services/dueReview';
import { isDeterministicallyCorrectAnswer } from '../../services/answerValidation';
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

const getMembership = (word: Pick<IWord, 'listMemberships'>, listId: string) =>
  word.listMemberships.find((membership) => membership.listId.toString() === listId);

const transformWord = async (word: IWord, listId: string, userId: string) => {
  const membership = getMembership(word, listId);
  const state = membership
    ? await ensureLearningState(userId, listId, word)
    : await LearningState.findOne({ userId, wordId: word._id, listId }).lean();

  return {
    id: word._id.toString(),
    value: word.value,
    meaning: membership?.meaning || '',
    dueAt: state?.dueAt?.toISOString(),
    lastReviewedAt: state?.lastReviewedAt?.toISOString(),
    reviewCount: state?.reviewCount || 0,
    lapseCount: state?.lapseCount || 0,
    stability: state?.stability || 0,
    difficulty: state?.difficulty || 0,
    status: state?.state ?? 0,
    created_at: word.created_at.toISOString(),
    updated_at: word.updated_at.toISOString()
  };
};

type UserLanguages = {
  baseLanguage: string;
  targetLanguage: string;
};

type DefinitionMode = 'default' | 'compact_gloss';

const resolveDefinition = async (
  req: { headers: Record<string, string | string[] | undefined> },
  value: string,
  listContext: string,
  providedMeaning?: string,
  languages?: UserLanguages,
  mode: DefinitionMode = 'default'
) => {
  if (providedMeaning?.trim()) {
    const normalizedMeaning = providedMeaning.trim();
    assertMeaningEncoding(normalizedMeaning);
    return normalizedMeaning;
  }

  let resolvedLanguages = languages;
  if (!resolvedLanguages) {
    const userId = resolveUserId(req.headers['user-id']);
    resolvedLanguages = await getUserLanguages(userId);
  }

  const generatedMeaning = await wordAgentService.generateDefinition(
    value,
    listContext,
    resolvedLanguages.baseLanguage,
    resolvedLanguages.targetLanguage,
    mode
  );

  assertMeaningEncoding(generatedMeaning);
  return generatedMeaning;
};

const addWordToList = async (listId: string, value: string, meaning: string) => {
  const normalizedValue = value.toLowerCase().trim();
  let word = await Word.findOne({ value: normalizedValue });

  if (word) {
    if (word.listMemberships.some((membership) => membership.listId.toString() === listId)) {
      return { status: 'duplicate' as const, word };
    }
    word.listMemberships.push({
      listId: new mongoose.Types.ObjectId(listId),
      meaning,
      addedAt: new Date(),
      updatedAt: new Date()
    });
    await word.save();
    return { status: 'linked' as const, word };
  }

  word = await Word.create({
    value: normalizedValue,
    listMemberships: [{
      listId: new mongoose.Types.ObjectId(listId),
      meaning,
      addedAt: new Date(),
      updatedAt: new Date()
    }]
  });
  return { status: 'created' as const, word };
};

router.post('/:listId/words', validate(addWordSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const { word: value, meaning: providedMeaning } = req.body;

    const list = await WordList.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    if (isDueReviewList(list)) {
      return res.status(403).json({ message: 'Due review list cannot be edited manually' });
    }

    const definition = await resolveDefinition(req, value, list.context || '', providedMeaning);
    const result = await addWordToList(listId, value, definition);

    if (result.status === 'duplicate') {
      return res.status(400).json({ message: 'Word already exists in this list' });
    }

    await WordList.findByIdAndUpdate(listId, { updated_at: new Date() });
    await persistLearningSnapshot();
    res.status(201).json(await transformWord(result.word, listId, resolveUserId(req.headers['user-id'])));
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
    if (isDueReviewList(list)) {
      return res.status(403).json({ message: 'Due review list cannot be edited manually' });
    }

    const needsGeneratedMeaning = words.some((item) => !item.meaning?.trim());
    const userId = resolveUserId(req.headers['user-id']);
    let languages: UserLanguages | undefined;

    if (needsGeneratedMeaning) {
      languages = await getUserLanguages(userId);
    }

    const seen = new Set<string>();
    const imported: Array<any> = [];
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
        const definition = await resolveDefinition(
          req,
          originalWord,
          list.context || '',
          item.meaning,
          languages,
          item.meaning?.trim() ? 'default' : 'compact_gloss'
        );
        const result = await addWordToList(listId, originalWord, definition);

        if (result.status === 'duplicate') {
          skipped.push({ word: originalWord, reason: 'already_exists_in_list' });
          continue;
        }

        imported.push(await transformWord(result.word, listId, userId));
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
    const userId = resolveUserId(req.headers['user-id']);
    const list = await WordList.findById(listId).lean();
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    if (isDueReviewList(list)) {
      const dueWords = await selectDueReviewWords(userId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      const data = dueWords.map((word) => ({
        id: word.id,
        value: word.value,
        meaning: word.meaning,
        dueAt: word.state.dueAt,
        lastReviewedAt: word.state.lastReviewedAt,
        reviewCount: word.state.reviewCount,
        lapseCount: word.state.lapseCount,
        stability: word.state.stability,
        difficulty: word.state.difficulty,
        status:
          word.state.status === 'new'
            ? 0
            : word.state.status === 'learning'
              ? 1
              : word.state.status === 'review'
                ? 2
                : 3,
        sourceListId: word.sourceListId,
        sourceListIds: word.sourceListIds,
        sourceListName: word.sourceListName,
        sourceListNames: word.sourceListNames,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString()
      }));

      return res.json(data);
    }

    const words = await Word.find({ 'listMemberships.listId': listId });
    const data = await Promise.all(words.map((word) => transformWord(word, listId, userId)));
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:listId/words/:wordId', validate(deleteWordSchema), async (req, res) => {
  try {
    const { listId, wordId } = req.params;
    const list = await WordList.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    if (isDueReviewList(list)) {
      return res.status(403).json({ message: 'Due review list cannot delete words' });
    }

    const word = await Word.findById(wordId);
    if (!word) return res.status(404).json({ message: 'Word not found' });

    word.listMemberships = word.listMemberships.filter((membership) => membership.listId.toString() !== listId);

    if (word.listMemberships.length === 0) {
      await Word.findByIdAndDelete(wordId);
      await LearningState.deleteMany({ wordId });
    } else {
      await word.save();
      await LearningState.deleteMany({ wordId, listId });
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
    if (isDeterministicallyCorrectAnswer(userAnswer, correctAnswer)) {
      return res.json({
        isValid: true,
        explanation: 'Matched by deterministic normalization before AI semantic validation.'
      });
    }

    const userId = resolveUserId(req.headers['user-id']);
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const result = await wordAgentService.validateAnswer(userAnswer, correctAnswer, context, baseLanguage, targetLanguage);
    res.json(result);
  } catch (error) {
    const { userAnswer, correctAnswer } = req.body;
    console.error('Answer validation fell back to deterministic comparison:', error);
    res.json({
      isValid: isDeterministicallyCorrectAnswer(userAnswer, correctAnswer),
      explanation: 'AI semantic validation was unavailable, so deterministic comparison was used.'
    });
  }
});

router.get('/word/:wordId', validate(wordIdSchema), async (req, res) => {
  try {
    const { wordId } = req.params;
    const userId = resolveUserId(req.headers['user-id']);
    const word = await Word.findById(wordId).lean();
    if (!word) return res.status(404).json({ message: 'Word not found' });

    const contexts = await Promise.all(
      word.listMemberships.map(async (membership) => {
        const [list, state] = await Promise.all([
          WordList.findById(membership.listId).lean(),
          ensureLearningState(userId, membership.listId.toString(), word)
        ]);

        return {
          listId: membership.listId.toString(),
          listName: list?.name || 'Unknown List',
          listContext: list?.context,
          meaning: membership.meaning,
          sourceListIds: membership.sourceListIds?.map((id) => id.toString()) || [],
          dueAt: state?.dueAt?.toISOString(),
          lastReviewedAt: state?.lastReviewedAt?.toISOString(),
          reviewCount: state?.reviewCount || 0,
          lapseCount: state?.lapseCount || 0,
          stability: state?.stability || 0,
          difficulty: state?.difficulty || 0
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
    if (!word || contextIndex >= word.listMemberships.length) {
      return res.status(404).json({ message: 'Word not found or invalid context' });
    }

    const membership = word.listMemberships[contextIndex];
    const list = await WordList.findById(membership.listId).lean();
    const context = list?.context || 'General';

    const userId = resolveUserId(req.headers['user-id']);
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const sentences = await wordAgentService.generateExamples(word.value, membership.meaning, context, baseLanguage, targetLanguage);

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
    if (!word || contextIndex >= word.listMemberships.length) {
      return res.status(404).json({ message: 'Word not found or invalid context' });
    }

    const membership = word.listMemberships[contextIndex];
    const list = await WordList.findById(membership.listId).lean();
    const context = list?.context || 'General';

    const userId = resolveUserId(req.headers['user-id']);
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);
    const similarWords = await wordAgentService.generateSimilarWords(word.value, membership.meaning, context, baseLanguage, targetLanguage);

    res.json({
      word: word.value,
      meaning: membership.meaning,
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
      Word.find({ 'listMemberships.listId': listId }).lean(),
      WordList.findById(listId).lean()
    ]);

    if (words.length === 0) {
      return res.status(400).json({ message: 'No words found in this list' });
    }

    const userId = resolveUserId(req.headers['user-id']);
    const { baseLanguage, targetLanguage } = await getUserLanguages(userId);

    const wordsForReading = words.map((word) => {
      const membership = getMembership({ listMemberships: word.listMemberships }, listId);
      return { value: word.value, meaning: membership?.meaning || '' };
    });

    const reading = await wordAgentService.generateLightReading(wordsForReading, list?.context || 'General', baseLanguage, targetLanguage);
    res.json(reading);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
