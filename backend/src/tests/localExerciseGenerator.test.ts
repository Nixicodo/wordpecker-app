import { generateLocalExercises } from '../services/localExerciseGenerator';

describe('generateLocalExercises', () => {
  const words = [
    { id: '1', value: 'hola', meaning: 'hello' },
    { id: '2', value: 'adios', meaning: 'goodbye' },
    { id: '3', value: 'gracias', meaning: 'thank you' },
    { id: '4', value: 'libro', meaning: 'book' },
  ];
  const distractorPool = [
    ...words,
    { id: '5', value: 'mesa', meaning: 'table' },
    { id: '6', value: 'puerta', meaning: 'door' },
    { id: '7', value: 'ventana', meaning: 'window' },
    { id: '8', value: 'cocina', meaning: 'kitchen' },
  ];

  it('mixes target_to_base and base_to_target for multiple choice fallback generation', () => {
    const exercises = generateLocalExercises(words, distractorPool, 'travel', ['multiple_choice', 'multiple_choice', 'multiple_choice', 'multiple_choice']);

    expect(exercises).toHaveLength(4);
    expect(exercises[0].direction).toBe('target_to_base');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hello');
    expect(exercises[1].correctAnswer).toBe('adios');
    expect(exercises[0].options).toContain('hello');
    expect(exercises[1].options).toContain('adios');
  });

  it('keeps fill_blank and sentence_completion in base_to_target mode', () => {
    const exercises = generateLocalExercises(words, distractorPool, 'study', ['fill_blank', 'sentence_completion']);

    expect(exercises[0].type).toBe('fill_blank');
    expect(exercises[0].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hola');
    expect(exercises[1].type).toBe('sentence_completion');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[1].options).toContain('adios');
  });

  it('uses a larger distractor pool instead of only recycling the active batch', () => {
    const exercises = generateLocalExercises(words, distractorPool, 'home', ['multiple_choice', 'multiple_choice', 'sentence_completion', 'true_false']);
    const optionTexts = exercises
      .flatMap((exercise) => exercise.options || [])
      .filter((option) => ['mesa', 'puerta', 'ventana', 'cocina'].includes(option));

    expect(optionTexts.length).toBeGreaterThan(0);
  });

  it('prefers extra distractors over reusing the same active batch words when enough extras exist', () => {
    const extraOnlyDistractors = distractorPool.filter((word) => !words.some((activeWord) => activeWord.id === word.id));
    const exercises = generateLocalExercises(words, extraOnlyDistractors, 'home', ['multiple_choice', 'multiple_choice', 'sentence_completion', 'true_false']);
    const distractorOptionTexts = exercises.flatMap((exercise) =>
      (exercise.options || []).filter((option) => option !== exercise.correctAnswer)
    );

    expect(distractorOptionTexts.some((option) => ['mesa', 'puerta', 'ventana', 'cocina'].includes(option))).toBe(true);
    expect(distractorOptionTexts.some((option) => ['hola', 'adios', 'gracias', 'libro'].includes(option))).toBe(false);
  });

  it('falls back to merging active words back in only when extra distractors are too few', () => {
    const tinyDistractorPool = [{ id: '5', value: 'mesa', meaning: 'table' }];
    const exercises = generateLocalExercises(words, tinyDistractorPool, 'home', ['multiple_choice']);
    const optionTexts = exercises.flatMap((exercise) => exercise.options || []);

    expect(optionTexts).toContain('mesa');
    expect(optionTexts.some((option) => ['adios', 'gracias', 'libro'].includes(option))).toBe(true);
  });

  it('generates real matching exercises instead of degrading them to multiple choice', () => {
    const exercises = generateLocalExercises(words, distractorPool, 'library', ['matching']);

    expect(exercises).toHaveLength(4);
    expect(exercises[0].type).toBe('matching');
    expect(exercises[0].options).toBeNull();
    expect(exercises[0].pairs).not.toBeNull();
    expect(exercises[0].pairs?.length).toBeGreaterThanOrEqual(3);
    expect(exercises[0].pairs?.some((pair) => pair.word === 'hola')).toBe(true);
    expect(exercises[0].wordIds).toBeDefined();
    expect(exercises[0].wordIds).toHaveLength(exercises[0].pairs?.length || 0);
    expect(exercises[0].wordIds).toContain('1');
  });

  it('upgrades fallback difficulty when a word is behaviorally challenging', () => {
    const challengingWords = [
      { id: '1', value: 'hola', meaning: 'hello', challengeScore: 0.82 },
      { id: '2', value: 'adios', meaning: 'goodbye', challengeScore: 0.15 },
    ];

    const exercises = generateLocalExercises(challengingWords, distractorPool, 'travel', ['multiple_choice', 'sentence_completion']);

    expect(exercises[0].difficulty).toBe('hard');
    expect(exercises[1].difficulty).toBe('medium');
  });

  it('uses Chinese question text without the context prefix across exercise types', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      ['multiple_choice', 'fill_blank', 'true_false', 'sentence_completion', 'matching']
    );

    expect(exercises[0].question).toBe('“hola”最接近的意思是什么？');
    expect(exercises[1].question).toBe('请写出意思是“goodbye”的单词。');
    expect(exercises[2].question).not.toContain('context');
    expect(exercises[2].question).not.toContain('Mexican Spanish frequency vocabulary level 0 (Pre-A1)');
    expect(exercises[2].question).toMatch(/^“gracias”的意思是“.+”。对还是错？$/);
    expect(exercises[3].question).toBe('哪个单词最适合补全表达“book”的句子？');
  });

  it('uses Chinese matching text without the context prefix', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      ['matching']
    );

    expect(exercises[0].question).toBe('请将每个单词与对应的意思正确配对。');
  });
});
