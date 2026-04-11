import { ExerciseType, ExerciseWithId } from '../agents/exercise-agent/schemas';
import { shuffleArray } from '../utils/arrayUtils';

type GeneratorWord = {
  id: string;
  value: string;
  meaning: string;
  challengeScore?: number;
};

type ExerciseDirection = ExerciseType['direction'];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function normalizeMeaning(meaning: string, fallbackWord: string): string {
  const trimmedMeaning = meaning.trim();
  return trimmedMeaning || `Meaning of ${fallbackWord}`;
}

function pickMeaningDistractors(words: GeneratorWord[], currentWordId: string, count: number): string[] {
  const distractors = words
    .filter((word) => word.id !== currentWordId)
    .map((word) => normalizeMeaning(word.meaning, word.value));

  return shuffleArray([...new Set(distractors)]).slice(0, count);
}

function pickWordDistractors(words: GeneratorWord[], currentWordId: string, count: number): string[] {
  return shuffleArray(
    [...new Set(words.filter((word) => word.id !== currentWordId).map((word) => word.value))]
  ).slice(0, count);
}

function selectDirection(index: number, type: ExerciseType['type']): ExerciseDirection {
  if (type === 'fill_blank' || type === 'sentence_completion') {
    return 'base_to_target';
  }

  return index % 2 === 0 ? 'target_to_base' : 'base_to_target';
}

function upgradeDifficulty(
  baseDifficulty: ExerciseWithId['difficulty'],
  challengeScore = 0
): ExerciseWithId['difficulty'] {
  if (challengeScore >= 0.72) {
    return 'hard';
  }

  if (challengeScore >= 0.45) {
    return baseDifficulty === 'easy' ? 'medium' : baseDifficulty;
  }

  return baseDifficulty;
}

function buildMultipleChoice(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  direction: ExerciseDirection,
): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  if (direction === 'base_to_target') {
    const options = shuffleArray([word.value, ...pickWordDistractors(allWords, word.id, 3)]);

    return {
      type: 'multiple_choice',
      direction,
      word: word.value,
      wordId: word.id,
      question: `In the "${context}" context, which target-language word matches "${correctMeaning}"?`,
      options,
      optionLabels: OPTION_LABELS.slice(0, options.length),
      correctAnswer: word.value,
      difficulty: upgradeDifficulty('easy', word.challengeScore),
      hint: `Look for the target-language word that expresses "${correctMeaning}".`,
      feedback: `"${word.value}" is the word that matches "${correctMeaning}" in this context.`,
      pairs: null,
    };
  }

  const options = shuffleArray([correctMeaning, ...pickMeaningDistractors(allWords, word.id, 3)]);

  return {
    type: 'multiple_choice',
    direction,
    word: word.value,
    wordId: word.id,
    question: `In the "${context}" context, what is the closest meaning of "${word.value}"?`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: correctMeaning,
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: `Recall the base-language meaning of "${word.value}".`,
    feedback: `"${word.value}" matches "${correctMeaning}" in this context.`,
    pairs: null,
  };
}

function buildFillBlank(word: GeneratorWord, context: string): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'fill_blank',
    direction: 'base_to_target',
    word: word.value,
    wordId: word.id,
    question: `Write the target-language word that means "${correctMeaning}" in the "${context}" context.`,
    options: null,
    optionLabels: null,
    correctAnswer: word.value,
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: 'The answer is the vocabulary word itself.',
    feedback: `The correct word is "${word.value}".`,
    pairs: null,
  };
}

function buildTrueFalse(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  direction: ExerciseDirection,
): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);
  const options = ['True', 'False'];

  if (direction === 'base_to_target') {
    const distractorWord = pickWordDistractors(allWords, word.id, 1)[0] ?? `${word.value} (alternative)`;
    const isTrue = Math.random() >= 0.5;
    const statementWord = isTrue ? word.value : distractorWord;

    return {
      type: 'true_false',
      direction,
      word: word.value,
      wordId: word.id,
      question: `True or false: in the "${context}" context, the word for "${correctMeaning}" is "${statementWord}".`,
      options,
      optionLabels: OPTION_LABELS.slice(0, options.length),
      correctAnswer: isTrue ? 'True' : 'False',
      difficulty: upgradeDifficulty('easy', word.challengeScore),
      hint: `Check whether "${statementWord}" really means "${correctMeaning}".`,
      feedback: `"${word.value}" is the correct word for "${correctMeaning}".`,
      pairs: null,
    };
  }

  const incorrectMeaning = pickMeaningDistractors(allWords, word.id, 1)[0] ?? `Another meaning for ${word.value}`;
  const isTrue = Math.random() >= 0.5;
  const statementMeaning = isTrue ? correctMeaning : incorrectMeaning;

  return {
    type: 'true_false',
    direction,
    word: word.value,
    wordId: word.id,
    question: `True or false: in the "${context}" context, "${word.value}" means "${statementMeaning}".`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: isTrue ? 'True' : 'False',
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: `Recall the actual meaning of "${word.value}".`,
    feedback: `"${word.value}" means "${correctMeaning}".`,
    pairs: null,
  };
}

function buildSentenceCompletion(word: GeneratorWord, allWords: GeneratorWord[], context: string): ExerciseWithId {
  const options = shuffleArray([word.value, ...pickWordDistractors(allWords, word.id, 3)]);
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'sentence_completion',
    direction: 'base_to_target',
    word: word.value,
    wordId: word.id,
    question: `Context: "${context}". Which target-language word best completes a sentence expressing "${correctMeaning}"?`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: word.value,
    difficulty: upgradeDifficulty('medium', word.challengeScore),
    hint: `Choose the target-language word that best matches "${correctMeaning}".`,
    feedback: `The best choice here is "${word.value}".`,
    pairs: null,
  };
}

function buildMatching(word: GeneratorWord, allWords: GeneratorWord[], context: string): ExerciseWithId {
  const additionalPairs = shuffleArray(
    allWords.filter((candidate) => candidate.id !== word.id)
  ).slice(0, 3);
  const pairWords = shuffleArray([word, ...additionalPairs]).slice(0, 4);
  const pairs = pairWords.map((pairWord) => ({
    word: pairWord.value,
    definition: normalizeMeaning(pairWord.meaning, pairWord.value)
  }));
  const correctAnswer = pairs
    .map((pair) => `${pair.word}:${pair.definition}`)
    .join('|');

  return {
    type: 'matching',
    direction: 'target_to_base',
    word: word.value,
    wordId: word.id,
    wordIds: pairWords.map((pairWord) => pairWord.id),
    question: `In the "${context}" context, match each target-language word with its correct meaning.`,
    options: null,
    optionLabels: null,
    correctAnswer,
    difficulty: upgradeDifficulty(pairWords.length >= 4 ? 'medium' : 'easy', word.challengeScore),
    hint: 'Start with the pair you are most confident about, then eliminate the remaining definitions.',
    feedback: `Review how "${word.value}" and the other words connect to their meanings in this context.`,
    pairs,
  };
}

function resolveType(rawType: string): ExerciseType['type'] {
  return rawType as ExerciseType['type'];
}

export function generateLocalExercises(
  words: GeneratorWord[],
  distractorWords: GeneratorWord[],
  context: string,
  exerciseTypes: string[],
): ExerciseWithId[] {
  const availableTypes = (exerciseTypes.length ? exerciseTypes : ['multiple_choice', 'fill_blank', 'true_false'])
    .map(resolveType);
  const distractorPool = distractorWords.length ? distractorWords : words;

  return words.map((word, index) => {
    const type = availableTypes[index % availableTypes.length] ?? 'multiple_choice';
    const direction = selectDirection(index, type);

    switch (type) {
      case 'fill_blank':
        return buildFillBlank(word, context);
      case 'true_false':
        return buildTrueFalse(word, distractorPool, context, direction);
      case 'sentence_completion':
        return buildSentenceCompletion(word, distractorPool, context);
      case 'matching':
        return buildMatching(word, distractorPool, context);
      case 'multiple_choice':
      default:
        return buildMultipleChoice(word, distractorPool, context, direction);
    }
  });
}
