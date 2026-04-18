export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface WordList {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  context?: string;
  kind?: 'custom' | 'mistake_book' | 'due_review';
  systemKey?: string;
  wordCount?: number;
  dueCount?: number;
  newCount?: number;
  learningCount?: number;
  reviewCount?: number;
  masteredCount?: number;
  retentionScore?: number;
  recentReviewCount?: number;
  averageResponseTimeMs?: number;
  hintUsageRate?: number;
  hardRate?: number;
  againRate?: number;
  sourceListCount?: number;
  created_at: string;
  updated_at: string;
}

export interface DisciplineStatus {
  dueReviewListId: string;
  dueCount: number;
  backlog: number;
  dailyNewWordLimit: number;
  newWordsAddedToday: number;
  remainingNewWordQuota: number;
  entryState: 'open' | 'soft_locked' | 'hard_locked' | 'quota_reached';
  canAccessExploration: boolean;
}

export interface Word {
  id: string;
  list_id?: string;
  value: string;
  meaning: string;
  dueAt?: string;
  lastReviewedAt?: string;
  reviewCount: number;
  lapseCount: number;
  stability: number;
  difficulty: number;
  status: number;
  sourceListId?: string;
  sourceListIds?: string[];
  sourceListName?: string;
  sourceListNames?: string[];
  created_at: string;
  updated_at: string;
}

export interface WordContext {
  listId: string;
  listName: string;
  listContext?: string;
  meaning: string;
  sourceListIds: string[];
  dueAt?: string;
  lastReviewedAt?: string;
  reviewCount: number;
  lapseCount: number;
  stability: number;
  difficulty: number;
}

export interface WordDetail {
  id: string;
  value: string;
  contexts: WordContext[];
  created_at: string;
  updated_at: string;
}

export interface SentenceExample {
  sentence: string;
  translation?: string | null;
  context_note?: string;
  explanation?: string;
}

export interface Exercise {
  word: string;
  wordId?: string | null;
  wordIds?: string[];
  type: 'multiple_choice' | 'fill_blank' | 'matching' | 'true_false' | 'sentence_completion';
  direction: 'target_to_base' | 'base_to_target';
  question: string;
  options: string[] | null;
  optionLabels: string[] | null;
  correctAnswer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string | null;
  feedback: string | null;
  pairs: Array<{word: string; definition: string}> | null;
  exposedWordIds?: string[];
  exposedWords?: Array<{
    id: string;
    value: string;
    meaning: string;
  }>;
}

export interface Question {
  word: string;
  wordId?: string | null;
  wordIds?: string[];
  type: 'multiple_choice' | 'fill_blank' | 'matching' | 'true_false' | 'sentence_completion';
  direction: 'target_to_base' | 'base_to_target';
  question: string;
  options: string[] | null;
  optionLabels: string[] | null;
  correctAnswer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string | null;
  feedback: string | null;
  pairs: Array<{word: string; definition: string}> | null;
  exposedWordIds?: string[];
  exposedWords?: Array<{
    id: string;
    value: string;
    meaning: string;
  }>;
}

export interface ScheduledWord {
  id: string;
  value: string;
  meaning: string;
  sourceListId?: string;
  sourceListIds?: string[];
  sourceListName?: string;
  sourceListNames?: string[];
  state: {
    dueAt: string;
    lastReviewedAt?: string;
    stability: number;
    difficulty: number;
    reviewCount: number;
    lapseCount: number;
    consecutiveCorrect: number;
    consecutiveWrong: number;
    retrievability: number;
    status: 'new' | 'learning' | 'review' | 'relearning';
    urgency: number;
  };
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewSubmission {
  wordId: string;
  wordIds?: string[];
  selfAssessedWordIds?: string[];
  sourceListId?: string;
  sourceListIdByWordId?: Record<string, string>;
  correct: boolean;
  rating: ReviewRating;
  questionType: string;
  responseTimeMs?: number;
  usedHint?: boolean;
  settlementKey?: string;
  answeredAt?: string;
}

export interface WordSourceInfo {
  sourceListId?: string;
  sourceListIds?: string[];
  sourceListName?: string;
  sourceListNames?: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  context?: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  words?: Array<{value: string; meaning: string}>;
  wordCount?: number;
  cloneCount: number;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExerciseTypePreferences {
  multiple_choice: boolean;
  fill_blank: boolean;
  matching: boolean;
  true_false: boolean;
  sentence_completion: boolean;
}

export interface UserPreferences {
  exerciseTypes: ExerciseTypePreferences;
  baseLanguage: string;
  targetLanguage: string;
}

export interface VocabularyRecommendation {
  word: string;
  meaning: string;
  example: string;
  difficulty_level?: 'basic' | 'intermediate' | 'advanced';
}

export interface ImageDescriptionAnalysis {
  corrected_description: string;
  feedback: string;
  recommendations: VocabularyRecommendation[];
  user_strengths: string[];
  missed_concepts: string[];
}

export interface DescriptionExercise {
  id: string;
  context: string;
  imageUrl: string;
  imageAlt: string;
  userDescription: string;
  analysis: ImageDescriptionAnalysis;
  recommendedWords: VocabularyRecommendation[];
  created_at: string;
}

export interface VocabularyWord {
  word: string;
  meaning: string;
  example: string;
  difficulty_level: 'basic' | 'intermediate' | 'advanced';
  context: string;
}

export interface DiscoveryWord {
  id: string;
  word: string;
  meaning: string;
  example: string;
  difficulty_level: 'basic' | 'intermediate' | 'advanced';
  context: string;
  sourceListId: string;
  sourceListName: string;
  sourceContext?: string;
}

export interface DiscoveryWordsResponse {
  targetList: {
    id: string;
    name: string;
  };
  sourceList: {
    id: string;
    name: string;
    context?: string;
    remainingCount: number;
    chainIndex: number;
    totalSources: number;
  } | null;
  words: DiscoveryWord[];
  count: number;
  chain: string[];
}

export interface VocabularyWordsResponse {
  context: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  words: VocabularyWord[];
  count: number;
  excludedWords: number;
}

export interface WordDetailsResponse {
  word: string;
  meaning: string;
  example: string;
  difficulty_level: 'basic' | 'intermediate' | 'advanced';
  context: string;
}

export interface SimilarWord {
  word: string;
  meaning: string;
  example: string;
  usage_note?: string;
}

export interface SimilarWordsResponse {
  word: string;
  meaning: string;
  context: string;
  similar_words: {
    synonyms: SimilarWord[];
    interchangeable_words: SimilarWord[];
  };
}

export interface LightReading {
  title: string;
  text: string;
  word_count: number;
  difficulty_level: string;
  theme: string;
  highlighted_words: Array<{
    word: string;
    definition: string;
    position: number | null;
  }>;
}

export interface BackgroundAsset {
  id: string;
  name: string;
  folder: string;
  relativePath: string;
  url: string;
}
