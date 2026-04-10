import { Router } from 'express';
import { validate } from 'echt';
import { WordList } from '../lists/model';
import { Word } from '../words/model';
import { UserPreferences } from '../preferences/model';
import { QuestionType } from '../../types';
import { quizAgentService } from './agent-service';
import { shuffleArray } from '../../utils/arrayUtils';
import { listIdSchema, updatePointsSchema } from './schemas';
import { applyLearnedPointResults, selectWeakWords } from '../../services/learningProgress';

const router = Router();

const getQuestionTypes = async (userId: string): Promise<QuestionType[]> => {
  if (!userId) return ['multiple_choice', 'fill_blank', 'true_false', 'sentence_completion'];

  const preferences = await UserPreferences.findOne({ userId });
  return preferences
    ? Object.entries(preferences.exerciseTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type]) => type as QuestionType)
    : ['multiple_choice', 'fill_blank', 'true_false', 'sentence_completion'];
};

router.post('/:listId/start', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const [list, words] = await Promise.all([
      WordList.findById(listId).lean(),
      Word.find({ 'ownedByLists.listId': listId }).lean()
    ]);

    if (!list) return res.status(404).json({ message: 'List not found' });
    if (!words.length) return res.status(400).json({ message: 'List has no words' });

    const prioritizedWords = selectWeakWords(words, listId, words.length);
    const questionTypes = await getQuestionTypes(req.headers['user-id'] as string);
    const questions = await quizAgentService.generateQuestions(
      prioritizedWords.slice(0, 5),
      list.context || 'General',
      questionTypes
    );

    res.json({
      questions,
      total_questions: prioritizedWords.length,
      list: { id: list._id.toString(), name: list.name, context: list.context }
    });
  } catch (error) {
    console.error('Error starting quiz:', error);
    res.status(500).json({ message: 'Error starting quiz' });
  }
});

router.post('/:listId/more', validate(listIdSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const [list, words] = await Promise.all([
      WordList.findById(listId).lean(),
      Word.find({ 'ownedByLists.listId': listId }).lean()
    ]);

    if (!list) return res.status(404).json({ message: 'List not found' });
    if (!words.length) return res.status(400).json({ message: 'List has no words' });

    const selected = shuffleArray(selectWeakWords(words, listId, Math.min(words.length, 10))).slice(0, 5);
    const questionTypes = await getQuestionTypes(req.headers['user-id'] as string);
    const questions = await quizAgentService.generateQuestions(selected, list.context || 'General', questionTypes);

    res.json({ questions });
  } catch (error) {
    console.error('Error getting more questions:', error);
    res.status(500).json({ message: 'Error getting more questions' });
  }
});

router.put('/:listId/learned-points', validate(updatePointsSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const { results } = req.body;

    await applyLearnedPointResults(listId, results);
    res.json({ message: 'Learned points updated successfully' });
  } catch (error) {
    console.error('Error updating learned points:', error);
    res.status(500).json({ message: 'Error updating learned points' });
  }
});

export default router;
