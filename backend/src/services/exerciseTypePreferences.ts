import { ExerciseTypePreferences, QuestionType } from '../types';

export const DEFAULT_QUESTION_TYPES: QuestionType[] = [
  'multiple_choice',
  'fill_blank',
  'matching',
  'true_false',
  'sentence_completion'
];

export const DEFAULT_EXERCISE_TYPE_PREFERENCES: ExerciseTypePreferences = {
  multiple_choice: true,
  fill_blank: true,
  matching: true,
  true_false: true,
  sentence_completion: true
};

export function resolveEnabledQuestionTypes(
  preferences?: Partial<ExerciseTypePreferences> | null
): QuestionType[] {
  const mergedPreferences = {
    ...DEFAULT_EXERCISE_TYPE_PREFERENCES,
    ...(preferences || {})
  };

  const enabledTypes = Object.entries(mergedPreferences)
    .filter(([, enabled]) => enabled)
    .map(([type]) => type as QuestionType);

  return enabledTypes.length ? enabledTypes : DEFAULT_QUESTION_TYPES;
}
