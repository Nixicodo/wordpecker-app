import { Router } from 'express';
import { validate } from 'echt';
import { WordList } from '../lists/model';
import { UserPreferences } from '../preferences/model';
import { QuestionType } from '../../types';
import { quizAgentService } from './agent-service';
import { listIdSchema, updatePointsSchema } from './schemas';
import { applyReviewResults } from '../../services/learningProgress';
import { getUserLanguages } from '../../utils/getUserLanguages';
import { resolveUserId } from '../../config/learning';
import { isMistakeBookList } from '../../services/mistakeBook';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import { resolveEnabledQuestionTypes } from '../../services/exerciseTypePreferences';
import { selectGenerationWordPool } from '../../services/exerciseGenerationPool';

const router = Router();

const getQuestionTypes = async (userId: string): Promise<QuestionType[]> => {
  const preferences = await UserPreferences.findOne({ userId });
  return resolveEnabledQuestionTypes(preferences?.exerciseTypes);
};

router.post('/:listId/start', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const list = await WordList.findById(listId).lean();

    if (!list) return res.status(404).json({ message: 'List not found' });

    const userId = resolveUserId(req.headers['user-id']);
    const [{ scheduledWords, generationPool }, questionTypes, { baseLanguage, targetLanguage }] = await Promise.all([
      selectGenerationWordPool(userId, listId),
      getQuestionTypes(userId),
      getUserLanguages(userId)
    ]);

    if (!scheduledWords.length) {
      return res.status(400).json({ message: 'List has no words' });
    }

    const questions = await quizAgentService.generateQuestions(
      scheduledWords.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      generationPool.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      list.context || 'General',
      questionTypes,
      baseLanguage,
      targetLanguage
    );

    res.json({
      questions,
      total_questions: scheduledWords.length,
      scheduledWords,
      list: { id: list._id.toString(), name: list.name, context: list.context, kind: list.kind }
    });
  } catch (error) {
    console.error('Error starting quiz:', error);
    res.status(500).json({ message: 'Error starting quiz' });
  }
});

router.post('/:listId/more', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const list = await WordList.findById(listId).lean();

    if (!list) return res.status(404).json({ message: 'List not found' });

    const userId = resolveUserId(req.headers['user-id']);
    const [{ scheduledWords, generationPool }, questionTypes, { baseLanguage, targetLanguage }] = await Promise.all([
      selectGenerationWordPool(userId, listId),
      getQuestionTypes(userId),
      getUserLanguages(userId)
    ]);

    if (!scheduledWords.length) {
      return res.status(400).json({ message: 'List has no words' });
    }

    const questions = await quizAgentService.generateQuestions(
      scheduledWords.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      generationPool.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      list.context || 'General',
      questionTypes,
      baseLanguage,
      targetLanguage
    );
    res.json({ questions, scheduledWords });
  } catch (error) {
    console.error('Error getting more questions:', error);
    res.status(500).json({ message: 'Error getting more questions' });
  }
});

router.put('/:listId/reviews', validate(updatePointsSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const userId = resolveUserId(req.headers['user-id']);
    const list = await WordList.findById(listId).lean();
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    const source = isMistakeBookList(list) ? 'mistake_review' : 'quiz';
    const results = req.body.results.map((result: any) => ({
      wordId: result.wordId,
      wordIds: result.wordIds,
      correct: result.correct,
      rating: result.rating || (result.correct ? 'good' : 'again'),
      questionType: result.questionType || 'unknown',
      responseTimeMs: result.responseTimeMs,
      usedHint: result.usedHint
    }));

    await applyReviewResults(userId, listId, source, results);
    await persistLearningSnapshot();
    res.json({ message: 'Review results updated successfully' });
  } catch (error) {
    console.error('Error updating review results:', error);
    res.status(500).json({ message: 'Error updating review results' });
  }
});

export default router;
