import { ExerciseType, ExerciseWithId } from '../agents/exercise-agent/schemas';
import { shuffleArray } from '../utils/arrayUtils';

type GeneratorWord = {
  id: string;
  value: string;
  meaning: string;
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function normalizeMeaning(meaning: string, fallbackWord: string): string {
  return meaning.trim() || `${fallbackWord} 的释义`;
}

function pickDistractors(words: GeneratorWord[], currentWordId: string, count: number): string[] {
  const distractors = words
    .filter((word) => word.id !== currentWordId)
    .map((word) => normalizeMeaning(word.meaning, word.value));

  return shuffleArray([...new Set(distractors)]).slice(0, count);
}

function pickWordDistractors(words: GeneratorWord[], currentWordId: string, count: number): string[] {
  return shuffleArray(words.filter((word) => word.id !== currentWordId).map((word) => word.value)).slice(0, count);
}

function buildMultipleChoice(word: GeneratorWord, allWords: GeneratorWord[], context: string): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);
  const options = shuffleArray([correctMeaning, ...pickDistractors(allWords, word.id, 3)]);

  return {
    type: 'multiple_choice',
    word: word.value,
    wordId: word.id,
    question: `在“${context}”语境中，“${word.value}”最接近下面哪个含义？`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: correctMeaning,
    difficulty: 'easy',
    hint: `回忆一下这个词在词树里的中文释义。`,
    feedback: `“${word.value}”在这里对应“${correctMeaning}”。`,
    pairs: null,
  };
}

function buildFillBlank(word: GeneratorWord, context: string): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'fill_blank',
    word: word.value,
    wordId: word.id,
    question: `请写出在“${context}”语境里表示“${correctMeaning}”的词。`,
    options: null,
    optionLabels: null,
    correctAnswer: word.value,
    difficulty: 'easy',
    hint: `答案就是这个词条本身。`,
    feedback: `正确答案是“${word.value}”。`,
    pairs: null,
  };
}

function buildTrueFalse(word: GeneratorWord, allWords: GeneratorWord[], context: string): ExerciseWithId {
  const correctMeaning = normalizeMeaning(word.meaning, word.value);
  const incorrectMeaning = pickDistractors(allWords, word.id, 1)[0] ?? `${word.value} 的另一个常见误解`;
  const isTrue = Math.random() >= 0.5;
  const statementMeaning = isTrue ? correctMeaning : incorrectMeaning;
  const options = ['正确', '错误'];

  return {
    type: 'true_false',
    word: word.value,
    wordId: word.id,
    question: `判断正误：在“${context}”语境中，“${word.value}”表示“${statementMeaning}”。`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: isTrue ? '正确' : '错误',
    difficulty: 'easy',
    hint: `先回忆“${word.value}”的真实含义。`,
    feedback: `“${word.value}”的正确含义是“${correctMeaning}”。`,
    pairs: null,
  };
}

function buildSentenceCompletion(word: GeneratorWord, allWords: GeneratorWord[], context: string): ExerciseWithId {
  const options = shuffleArray([word.value, ...pickWordDistractors(allWords, word.id, 3)]);
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'sentence_completion',
    word: word.value,
    wordId: word.id,
    question: `语境：${context}。如果想表达“${correctMeaning}”，下面句子中的空格最适合填哪个词？`,
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: word.value,
    difficulty: 'medium',
    hint: `选择最符合释义的那个目标语言词。`,
    feedback: `这里应填“${word.value}”。`,
    pairs: null,
  };
}

function resolveType(rawType: string): ExerciseType['type'] {
  if (rawType === 'matching') {
    return 'multiple_choice';
  }

  return rawType as ExerciseType['type'];
}

export function generateLocalExercises(
  words: GeneratorWord[],
  context: string,
  exerciseTypes: string[],
): ExerciseWithId[] {
  const availableTypes = (exerciseTypes.length ? exerciseTypes : ['multiple_choice', 'fill_blank', 'true_false'])
    .map(resolveType);

  return words.map((word, index) => {
    const type = availableTypes[index % availableTypes.length] ?? 'multiple_choice';

    switch (type) {
      case 'fill_blank':
        return buildFillBlank(word, context);
      case 'true_false':
        return buildTrueFalse(word, words, context);
      case 'sentence_completion':
        return buildSentenceCompletion(word, words, context);
      case 'multiple_choice':
      default:
        return buildMultipleChoice(word, words, context);
    }
  });
}
