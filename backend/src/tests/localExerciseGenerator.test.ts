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
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'travel',
      ['multiple_choice', 'multiple_choice', 'multiple_choice', 'multiple_choice'],
      'Chinese',
      'Spanish'
    );

    expect(exercises).toHaveLength(4);
    expect(exercises[0].direction).toBe('target_to_base');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hello');
    expect(exercises[1].correctAnswer).toBe('adios');
    expect(exercises[0].options).toContain('hello');
    expect(exercises[1].options).toContain('adios');
  });

  it('keeps fill_blank and sentence_completion in base_to_target mode', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'study',
      ['fill_blank', 'sentence_completion'],
      'Chinese',
      'Spanish'
    );

    expect(exercises[0].type).toBe('fill_blank');
    expect(exercises[0].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hola');
    expect(exercises[1].type).toBe('sentence_completion');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[1].options).toContain('adios');
  });

  it('uses a larger distractor pool instead of only recycling the active batch', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'home',
      ['multiple_choice', 'multiple_choice', 'sentence_completion', 'true_false'],
      'Chinese',
      'Spanish'
    );
    const optionTexts = exercises
      .flatMap((exercise) => exercise.options || [])
      .filter((option) => ['mesa', 'puerta', 'ventana', 'cocina'].includes(option));

    expect(optionTexts.length).toBeGreaterThan(0);
  });

  it('prefers extra distractors over reusing the same active batch words when enough extras exist', () => {
    const extraOnlyDistractors = distractorPool.filter((word) => !words.some((activeWord) => activeWord.id === word.id));
    const exercises = generateLocalExercises(
      words,
      extraOnlyDistractors,
      'home',
      ['multiple_choice', 'multiple_choice', 'sentence_completion', 'true_false'],
      'Chinese',
      'Spanish'
    );
    const distractorOptionTexts = exercises.flatMap((exercise) =>
      (exercise.options || []).filter((option) => option !== exercise.correctAnswer)
    );

    expect(distractorOptionTexts.some((option) => ['mesa', 'puerta', 'ventana', 'cocina'].includes(option))).toBe(true);
    expect(distractorOptionTexts.some((option) => ['hola', 'adios', 'gracias', 'libro'].includes(option))).toBe(false);
  });

  it('falls back to merging active words back in only when extra distractors are too few', () => {
    const tinyDistractorPool = [{ id: '5', value: 'mesa', meaning: 'table' }];
    const exercises = generateLocalExercises(
      words,
      tinyDistractorPool,
      'home',
      ['multiple_choice'],
      'Chinese',
      'Spanish'
    );
    const optionTexts = exercises.flatMap((exercise) => exercise.options || []);

    expect(optionTexts).toContain('mesa');
    expect(optionTexts.some((option) => ['adios', 'gracias', 'libro'].includes(option))).toBe(true);
  });

  it('generates real matching exercises instead of degrading them to multiple choice', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'library',
      ['matching'],
      'Chinese',
      'Spanish'
    );

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

    const exercises = generateLocalExercises(
      challengingWords,
      distractorPool,
      'travel',
      ['multiple_choice', 'sentence_completion'],
      'Chinese',
      'Spanish'
    );

    expect(exercises[0].difficulty).toBe('hard');
    expect(exercises[1].difficulty).toBe('medium');
  });

  it('uses Spanish question text and Chinese helper copy for fallback exercises', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      ['multiple_choice', 'fill_blank', 'true_false', 'sentence_completion', 'matching'],
      'Chinese',
      'Spanish'
    );

    expect(exercises[0].question).toBe('Que significa "hola"?');
    expect(exercises[0].hint).toBe('\u63d0\u793a\uff1a\u5148\u56de\u5fc6"hola"\u7684\u4e2d\u6587\u542b\u4e49\u3002');
    expect(exercises[1].question).toBe('Escribe la palabra en espanol que corresponde a "goodbye".');
    expect(exercises[1].hint).toBe('\u63d0\u793a\uff1a\u56de\u5fc6\u4e0e"goodbye"\u5bf9\u5e94\u7684\u897f\u73ed\u7259\u8bed\u5355\u8bcd\u3002');
    expect(exercises[2].question).toMatch(/^"gracias" significa ".+". Es verdadero o falso\?$/);
    expect(exercises[2].options).toEqual(['Verdadero', 'Falso']);
    expect(exercises[3].question).toBe('Que palabra en espanol completa mejor una frase relacionada con "book"?');
  });

  it('uses Spanish matching copy without leaking the raw context string', () => {
    const exercises = generateLocalExercises(
      words,
      distractorPool,
      'Mexican Spanish frequency vocabulary level 0 (Pre-A1)',
      ['matching'],
      'Chinese',
      'Spanish'
    );

    expect(exercises[0].question).toBe('Relaciona cada palabra con su significado correcto.');
    expect(exercises[0].question).not.toContain('context');
    expect(exercises[0].question).not.toContain('Mexican Spanish frequency vocabulary level 0 (Pre-A1)');
  });
});
