import { UserPreferences } from '../api/preferences/model';
import { DEFAULT_BASE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '../api/preferences/defaults';

export interface UserLanguages {
  baseLanguage: string;
  targetLanguage: string;
}

export async function getUserLanguages(userId: string): Promise<UserLanguages> {
  const preferences = await UserPreferences.findOne({ userId });
  
  if (preferences) {
    return {
      baseLanguage: preferences.baseLanguage || DEFAULT_BASE_LANGUAGE,
      targetLanguage: preferences.targetLanguage || DEFAULT_TARGET_LANGUAGE
    };
  }
  
  // Return defaults if no preferences exist
  return {
    baseLanguage: DEFAULT_BASE_LANGUAGE,
    targetLanguage: DEFAULT_TARGET_LANGUAGE
  };
}
