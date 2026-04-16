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
const MIN_DISTRACTOR_COUNT = 3;

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

function isChineseLanguage(language: string): boolean {
  return /chinese|mandarin|zh|中文|汉语|简体中文/i.test(language);
}

function isSpanishLanguage(language: string): boolean {
  return /spanish|espa[nñ]ol|castellano|西班牙语|拉丁美洲西班牙语/i.test(language);
}

function buildLanguageCopy(baseLanguage: string, targetLanguage: string) {
  const useChineseSupport = isChineseLanguage(baseLanguage);
  const useSpanishQuestions = isSpanishLanguage(targetLanguage);
  const targetWordLabel = useSpanishQuestions ? 'palabra en espanol' : 'target-language word';
  const booleanOptions = useSpanishQuestions ? ['Verdadero', 'Falso'] : ['True', 'False'];

  return {
    booleanOptions,
    multipleChoiceBaseToTargetQuestion: (meaning: string) => (
      useSpanishQuestions
        ? `Que ${targetWordLabel} corresponde a "${meaning}"?`
        : `Which ${targetWordLabel} matches "${meaning}"?`
    ),
    multipleChoiceTargetToBaseQuestion: (word: string) => (
      useSpanishQuestions
        ? `Que significa "${word}"?`
        : `What does "${word}" mean?`
    ),
    fillBlankQuestion: (meaning: string) => (
      useSpanishQuestions
        ? `Escribe la ${targetWordLabel} que corresponde a "${meaning}".`
        : `Write the ${targetWordLabel} that matches "${meaning}".`
    ),
    trueFalseBaseToTargetQuestion: (word: string, meaning: string) => (
      useSpanishQuestions
        ? `"${word}" corresponde a "${meaning}". Es verdadero o falso?`
        : `"${word}" matches "${meaning}". Is that true or false?`
    ),
    trueFalseTargetToBaseQuestion: (word: string, meaning: string) => (
      useSpanishQuestions
        ? `"${word}" significa "${meaning}". Es verdadero o falso?`
        : `"${word}" means "${meaning}". Is that true or false?`
    ),
    sentenceCompletionQuestion: (meaning: string) => (
      useSpanishQuestions
        ? `Que ${targetWordLabel} completa mejor una frase relacionada con "${meaning}"?`
        : `Which ${targetWordLabel} best completes a sentence related to "${meaning}"?`
    ),
    matchingQuestion: () => (
      useSpanishQuestions
        ? 'Relaciona cada palabra con su significado correcto.'
        : 'Match each word with its correct meaning.'
    ),
    hintForMeaning: (meaning: string) => (
      useChineseSupport
        ? `\u63d0\u793a\uff1a\u56de\u5fc6\u4e0e"${meaning}"\u5bf9\u5e94\u7684\u897f\u73ed\u7259\u8bed\u5355\u8bcd\u3002`
        : `Hint: recall the ${targetLanguage} word that matches "${meaning}".`
    ),
    hintForWord: (word: string) => (
      useChineseSupport
        ? `\u63d0\u793a\uff1a\u5148\u56de\u5fc6"${word}"\u7684\u4e2d\u6587\u542b\u4e49\u3002`
        : `Hint: recall the base-language meaning of "${word}".`
    ),
    hintForStatement: (statement: string, meaning: string) => (
      useChineseSupport
        ? `\u63d0\u793a\uff1a\u5224\u65ad"${statement}"\u662f\u5426\u771f\u7684\u8868\u793a"${meaning}"\u3002`
        : `Hint: verify whether "${statement}" really expresses "${meaning}".`
    ),
    hintForMatching: () => (
      useChineseSupport
        ? '\u63d0\u793a\uff1a\u5148\u4ece\u4f60\u6700\u6709\u628a\u63e1\u7684\u914d\u5bf9\u5f00\u59cb\uff0c\u518d\u6392\u9664\u5176\u4f59\u9009\u9879\u3002'
        : 'Hint: start with the pair you know best, then eliminate the rest.'
    ),
    feedbackForWord: (word: string) => (
      useChineseSupport
        ? `\u6b63\u786e\u7b54\u6848\u662f"${word}"\u3002`
        : `The correct answer is "${word}".`
    ),
    feedbackForMeaning: (word: string, meaning: string) => (
      useChineseSupport
        ? `"${word}"\u5bf9\u5e94\u7684\u542b\u4e49\u662f"${meaning}"\u3002`
        : `"${word}" matches "${meaning}" in this context.`
    ),
    feedbackForMatching: (word: string) => (
      useChineseSupport
        ? `\u8bf7\u91cd\u65b0\u786e\u8ba4"${word}"\u4e0e\u5176\u4ed6\u5355\u8bcd\u7684\u5bf9\u5e94\u542b\u4e49\u3002`
        : `Review how "${word}" connects to its meaning in this set.`
    )
  };
}

type LanguageCopy = ReturnType<typeof buildLanguageCopy>;

function buildMultipleChoice(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  direction: ExerciseDirection,
  copy: LanguageCopy
): ExerciseWithId {
  void context;
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  if (direction === 'base_to_target') {
    const options = shuffleArray([word.value, ...pickWordDistractors(allWords, word.id, 3)]);

    return {
      type: 'multiple_choice',
      direction,
      word: word.value,
      wordId: word.id,
      question: copy.multipleChoiceBaseToTargetQuestion(correctMeaning),
      options,
      optionLabels: OPTION_LABELS.slice(0, options.length),
      correctAnswer: word.value,
      difficulty: upgradeDifficulty('easy', word.challengeScore),
      hint: copy.hintForMeaning(correctMeaning),
      feedback: copy.feedbackForMeaning(word.value, correctMeaning),
      pairs: null,
    };
  }

  const options = shuffleArray([correctMeaning, ...pickMeaningDistractors(allWords, word.id, 3)]);

  return {
    type: 'multiple_choice',
    direction,
    word: word.value,
    wordId: word.id,
    question: copy.multipleChoiceTargetToBaseQuestion(word.value),
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: correctMeaning,
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: copy.hintForWord(word.value),
    feedback: copy.feedbackForMeaning(word.value, correctMeaning),
    pairs: null,
  };
}

function buildFillBlank(word: GeneratorWord, context: string, copy: LanguageCopy): ExerciseWithId {
  void context;
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'fill_blank',
    direction: 'base_to_target',
    word: word.value,
    wordId: word.id,
    question: copy.fillBlankQuestion(correctMeaning),
    options: null,
    optionLabels: null,
    correctAnswer: word.value,
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: copy.hintForMeaning(correctMeaning),
    feedback: copy.feedbackForWord(word.value),
    pairs: null,
  };
}

function buildTrueFalse(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  direction: ExerciseDirection,
  copy: LanguageCopy
): ExerciseWithId {
  void context;
  const correctMeaning = normalizeMeaning(word.meaning, word.value);
  const options = copy.booleanOptions;

  if (direction === 'base_to_target') {
    const distractorWord = pickWordDistractors(allWords, word.id, 1)[0] ?? `${word.value} (alternative)`;
    const isTrue = Math.random() >= 0.5;
    const statementWord = isTrue ? word.value : distractorWord;

    return {
      type: 'true_false',
      direction,
      word: word.value,
      wordId: word.id,
      question: copy.trueFalseBaseToTargetQuestion(statementWord, correctMeaning),
      options,
      optionLabels: OPTION_LABELS.slice(0, options.length),
      correctAnswer: isTrue ? options[0] : options[1],
      difficulty: upgradeDifficulty('easy', word.challengeScore),
      hint: copy.hintForStatement(statementWord, correctMeaning),
      feedback: copy.feedbackForMeaning(word.value, correctMeaning),
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
    question: copy.trueFalseTargetToBaseQuestion(word.value, statementMeaning),
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: isTrue ? options[0] : options[1],
    difficulty: upgradeDifficulty('easy', word.challengeScore),
    hint: copy.hintForWord(word.value),
    feedback: copy.feedbackForMeaning(word.value, correctMeaning),
    pairs: null,
  };
}

function buildSentenceCompletion(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  copy: LanguageCopy
): ExerciseWithId {
  void context;
  const options = shuffleArray([word.value, ...pickWordDistractors(allWords, word.id, 3)]);
  const correctMeaning = normalizeMeaning(word.meaning, word.value);

  return {
    type: 'sentence_completion',
    direction: 'base_to_target',
    word: word.value,
    wordId: word.id,
    question: copy.sentenceCompletionQuestion(correctMeaning),
    options,
    optionLabels: OPTION_LABELS.slice(0, options.length),
    correctAnswer: word.value,
    difficulty: upgradeDifficulty('medium', word.challengeScore),
    hint: copy.hintForMeaning(correctMeaning),
    feedback: copy.feedbackForWord(word.value),
    pairs: null,
  };
}

function buildMatching(
  word: GeneratorWord,
  allWords: GeneratorWord[],
  context: string,
  copy: LanguageCopy
): ExerciseWithId {
  void context;
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
    question: copy.matchingQuestion(),
    options: null,
    optionLabels: null,
    correctAnswer,
    difficulty: upgradeDifficulty(pairWords.length >= 4 ? 'medium' : 'easy', word.challengeScore),
    hint: copy.hintForMatching(),
    feedback: copy.feedbackForMatching(word.value),
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
  baseLanguage = 'English',
  targetLanguage = 'English',
): ExerciseWithId[] {
  const availableTypes = (exerciseTypes.length ? exerciseTypes : ['multiple_choice', 'fill_blank', 'true_false'])
    .map(resolveType);
  const distractorPool = distractorWords.length >= MIN_DISTRACTOR_COUNT
    ? distractorWords
    : shuffleArray([...words, ...distractorWords]);
  const copy = buildLanguageCopy(baseLanguage, targetLanguage);

  return words.map((word, index) => {
    const type = availableTypes[index % availableTypes.length] ?? 'multiple_choice';
    const direction = selectDirection(index, type);

    switch (type) {
      case 'fill_blank':
        return buildFillBlank(word, context, copy);
      case 'true_false':
        return buildTrueFalse(word, distractorPool, context, direction, copy);
      case 'sentence_completion':
        return buildSentenceCompletion(word, distractorPool, context, copy);
      case 'matching':
        return buildMatching(word, distractorPool, context, copy);
      case 'multiple_choice':
      default:
        return buildMultipleChoice(word, distractorPool, context, direction, copy);
    }
  });
}
