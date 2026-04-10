import { Router, Request, Response } from 'express';
import { validate } from 'echt';
import { WordList } from '../lists/model';
import { Word } from '../words/model';
import { UserPreferences } from '../preferences/model';
import { QuestionType } from '../../types';
import { learnAgentService } from './agent-service';
import { getUserLanguages } from '../../utils/getUserLanguages';
import { listIdSchema, updatePointsSchema } from './schemas';
import { applyLearnedPointResults, selectWeakWords } from '../../services/learningProgress';

const router = Router();

const getExerciseTypes = async (userId: string): Promise<QuestionType[]> => {
  if (!userId) return ['multiple_choice', 'fill_blank', 'true_false'];
  
  const preferences = await UserPreferences.findOne({ userId });
  return preferences 
    ? Object.entries(preferences.exerciseTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type]) => type as QuestionType)
    : ['multiple_choice', 'fill_blank', 'true_false'];
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

    const userId = req.headers['user-id'] as string;
    const [selectedWords, exerciseTypes, { baseLanguage, targetLanguage }] = await Promise.all([
      selectWeakWords(words, listId),
      getExerciseTypes(userId),
      getUserLanguages(userId || 'default')
    ]);

    const exercises = await learnAgentService.generateExercises(
      selectedWords, 
      list.context || 'General', 
      exerciseTypes, 
      baseLanguage, 
      targetLanguage
    );

    res.json({
      exercises,
      list: { id: list._id.toString(), name: list.name, context: list.context }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error starting learning session' });
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

    const userId = req.headers['user-id'] as string;
    const [selectedWords, exerciseTypes, { baseLanguage, targetLanguage }] = await Promise.all([
      selectWeakWords(words, listId),
      getExerciseTypes(userId),
      getUserLanguages(userId || 'default')
    ]);

    const exercises = await learnAgentService.generateExercises(
      selectedWords, 
      list.context || 'General', 
      exerciseTypes, 
      baseLanguage, 
      targetLanguage
    );

    res.json({ exercises });
  } catch (error) {
    res.status(500).json({ message: 'Error getting more exercises' });
  }
});

router.put('/:listId/learned-points', validate(updatePointsSchema), async (req, res) => {
  try {
    const { listId } = req.params;
    const { results } = req.body;

    await applyLearnedPointResults(listId, results);
    res.json({ message: 'Learned points updated successfully' });
  } catch (error) {
    console.error('Error updating learned points after learning session:', error);
    res.status(500).json({ message: 'Error updating learned points' });
  }
});

export default router; 
