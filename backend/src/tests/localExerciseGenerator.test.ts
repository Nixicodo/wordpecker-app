import { generateLocalExercises } from '../services/localExerciseGenerator';

describe('generateLocalExercises', () => {
  const words = [
    { id: '1', value: 'hola', meaning: 'hello' },
    { id: '2', value: 'adios', meaning: 'goodbye' },
    { id: '3', value: 'gracias', meaning: 'thank you' },
    { id: '4', value: 'libro', meaning: 'book' },
  ];

  it('mixes target_to_base and base_to_target for multiple choice fallback generation', () => {
    const exercises = generateLocalExercises(words, 'travel', ['multiple_choice', 'multiple_choice', 'multiple_choice', 'multiple_choice']);

    expect(exercises).toHaveLength(4);
    expect(exercises[0].direction).toBe('target_to_base');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hello');
    expect(exercises[1].correctAnswer).toBe('adios');
    expect(exercises[0].options).toContain('hello');
    expect(exercises[1].options).toContain('adios');
  });

  it('keeps fill_blank and sentence_completion in base_to_target mode', () => {
    const exercises = generateLocalExercises(words, 'study', ['fill_blank', 'sentence_completion']);

    expect(exercises[0].type).toBe('fill_blank');
    expect(exercises[0].direction).toBe('base_to_target');
    expect(exercises[0].correctAnswer).toBe('hola');
    expect(exercises[1].type).toBe('sentence_completion');
    expect(exercises[1].direction).toBe('base_to_target');
    expect(exercises[1].options).toContain('adios');
  });
});
