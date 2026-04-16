import { Router } from 'express';
import { validate } from 'echt';
import { WordList } from '../lists/model';
import { UserPreferences } from '../preferences/model';
import { QuestionType } from '../../types';
import { learnAgentService } from './agent-service';
import { getUserLanguages } from '../../utils/getUserLanguages';
import { listIdSchema, updatePointsSchema } from './schemas';
import { applyReviewResults } from '../../services/learningProgress';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import { resolveUserId } from '../../config/learning';
import {
  resolveDisciplinedQuestionTypes,
  resolveEnabledQuestionTypes
} from '../../services/exerciseTypePreferences';
import { selectGenerationWordPool } from '../../services/exerciseGenerationPool';
import { resolveGenerationLanguages } from '../../services/generationLanguages';
import { isDueReviewList } from '../../services/dueReview';

const router = Router();

const getExerciseTypes = async (userId: string, isDisciplinedReview: boolean): Promise<QuestionType[]> => {
  if (isDisciplinedReview) {
    return resolveDisciplinedQuestionTypes();
  }

  const preferences = await UserPreferences.findOne({ userId });
  return resolveEnabledQuestionTypes(preferences?.exerciseTypes);
};

const buildWordSources = (
  words: Array<{
    id: string;
    sourceListId?: string;
    sourceListIds?: string[];
    sourceListName?: string;
    sourceListNames?: string[];
  }>
) => Object.fromEntries(
  words
    .filter((word) => Boolean(word.sourceListId))
    .map((word) => [
      word.id,
      {
        sourceListId: word.sourceListId,
        sourceListIds: word.sourceListIds,
        sourceListName: word.sourceListName,
        sourceListNames: word.sourceListNames
      }
    ])
);

router.post('/:listId/start', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const list = await WordList.findById(listId).lean();

    if (!list) return res.status(404).json({ message: 'List not found' });

    const userId = resolveUserId(req.headers['user-id']);
    const isDisciplinedReview = isDueReviewList(list);
    const [{ scheduledWords, extraDistractors }, exerciseTypes, userLanguages] = await Promise.all([
      selectGenerationWordPool(userId, listId),
      getExerciseTypes(userId, isDisciplinedReview),
      getUserLanguages(userId)
    ]);

    if (!scheduledWords.length) {
      return res.status(400).json({ message: 'List has no words' });
    }

    const { baseLanguage, targetLanguage } = resolveGenerationLanguages(userLanguages, scheduledWords);

    const exercises = await learnAgentService.generateExercises(
      scheduledWords.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      extraDistractors.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      list.context || 'General',
      exerciseTypes,
      baseLanguage,
      targetLanguage
    );

    res.json({
      exercises,
      scheduledWords,
      wordSources: buildWordSources([...scheduledWords, ...extraDistractors]),
      list: { id: list._id.toString(), name: list.name, context: list.context, kind: list.kind }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error starting learning session' });
  }
});

router.post('/:listId/more', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const list = await WordList.findById(listId).lean();

    if (!list) return res.status(404).json({ message: 'List not found' });

    const userId = resolveUserId(req.headers['user-id']);
    const isDisciplinedReview = isDueReviewList(list);
    const requestBody = req.body as { excludeWordIds?: unknown[] } | undefined;
    const excludeWordIds = Array.isArray(requestBody?.excludeWordIds)
      ? requestBody.excludeWordIds.filter((wordId: unknown): wordId is string => typeof wordId === 'string')
      : [];
    const [{ scheduledWords, extraDistractors }, exerciseTypes, userLanguages] = await Promise.all([
      selectGenerationWordPool(userId, listId, undefined, undefined, excludeWordIds),
      getExerciseTypes(userId, isDisciplinedReview),
      getUserLanguages(userId)
    ]);

    if (!scheduledWords.length) {
      return res.status(400).json({ message: 'List has no words' });
    }

    const { baseLanguage, targetLanguage } = resolveGenerationLanguages(userLanguages, scheduledWords);

    const exercises = await learnAgentService.generateExercises(
      scheduledWords.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      extraDistractors.map(({ id, value, meaning, state }) => ({ id, value, meaning, challengeScore: state.challengeScore })),
      list.context || 'General',
      exerciseTypes,
      baseLanguage,
      targetLanguage
    );
    res.json({
      exercises,
      scheduledWords,
      wordSources: buildWordSources([...scheduledWords, ...extraDistractors])
    });
  } catch (error) {
    res.status(500).json({ message: 'Error getting more exercises' });
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

    const source = isDueReviewList(list) ? 'due_review' : 'learn';
    const results = req.body.results.map((result: any) => ({
      wordId: result.wordId,
      wordIds: result.wordIds,
      sourceListId: result.sourceListId,
      sourceListIdByWordId: result.sourceListIdByWordId,
      correct: result.correct,
      rating: result.rating || (result.correct ? 'good' : 'again'),
      questionType: result.questionType || 'unknown',
      selfAssessedWordIds: result.selfAssessedWordIds,
      responseTimeMs: result.responseTimeMs,
      usedHint: result.usedHint
    }));

    await applyReviewResults(userId, listId, source, results);
    await persistLearningSnapshot();
    res.json({ message: 'Review results updated successfully' });
  } catch (error) {
    console.error('Error updating review results after learning session:', error);
    res.status(500).json({ message: 'Error updating review results' });
  }
});

export default router;
