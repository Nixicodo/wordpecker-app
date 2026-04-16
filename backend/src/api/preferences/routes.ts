import { Router, Request, Response } from 'express';
import { validate } from 'echt';
import { UserPreferences } from './model';
import { DEFAULT_BASE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from './defaults';
import { updatePreferencesSchema } from './schemas';
import { persistLearningSnapshot } from '../../services/repoLearningSnapshot';
import {
  DEFAULT_EXERCISE_TYPE_PREFERENCES,
  resolveEnabledQuestionTypes
} from '../../services/exerciseTypePreferences';

const router = Router();

const getUserId = <T extends { headers: Record<string, any> }>(req: T) => {
  const userId = req.headers['user-id'] as string;
  if (!userId) throw new Error('User ID is required');
  return userId;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    let preferences = await UserPreferences.findOne({ userId });

    if (!preferences) {
      preferences = await UserPreferences.create({
        userId,
        exerciseTypes: DEFAULT_EXERCISE_TYPE_PREFERENCES,
        baseLanguage: DEFAULT_BASE_LANGUAGE,
        targetLanguage: DEFAULT_TARGET_LANGUAGE
      });
      await persistLearningSnapshot();
    }

    res.json({
      exerciseTypes: {
        ...DEFAULT_EXERCISE_TYPE_PREFERENCES,
        ...preferences.exerciseTypes
      },
      baseLanguage: preferences.baseLanguage,
      targetLanguage: preferences.targetLanguage
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to fetch preferences' });
  }
});

router.put('/', validate(updatePreferencesSchema), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { exerciseTypes, baseLanguage, targetLanguage } = req.body;
    
    const updateData: Record<string, any> = { userId };
    
    if (exerciseTypes) {
      if (typeof exerciseTypes !== 'object') {
        return res.status(400).json({ error: 'Invalid exercise types' });
      }
      if (resolveEnabledQuestionTypes(exerciseTypes).length === 0) {
        return res.status(400).json({ error: 'At least one exercise type must be enabled' });
      }
      updateData.exerciseTypes = {
        ...DEFAULT_EXERCISE_TYPE_PREFERENCES,
        ...exerciseTypes
      };
    }
    
    if (baseLanguage) updateData.baseLanguage = baseLanguage;
    if (targetLanguage) updateData.targetLanguage = targetLanguage;

    const preferences = await UserPreferences.findOneAndUpdate(
      { userId },
      updateData,
      { new: true, upsert: true }
    );

    await persistLearningSnapshot();
    res.json({
      exerciseTypes: {
        ...DEFAULT_EXERCISE_TYPE_PREFERENCES,
        ...preferences.exerciseTypes
      },
      baseLanguage: preferences.baseLanguage,
      targetLanguage: preferences.targetLanguage
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update preferences' });
  }
});

export default router;
