import { buildDefinitionUserPrompt, buildValidationUserPrompt } from '../api/words/agent-service';

describe('wordAgentService prompt builders', () => {
  it('uses compact gloss instructions for batch-imported words without provided meanings', () => {
    const prompt = buildDefinitionUserPrompt('iglesia', '', 'Chinese', 'Spanish', 'compact_gloss');

    expect(prompt).toContain('Return exactly one concise line, not a paragraph.');
    expect(prompt).toContain('Keep the base-language meaning to a few words only.');
    expect(prompt).toContain('Do not add full-sentence explanations');
    expect(prompt).toContain('教堂（church）');
  });

  it('keeps the default definition prompt unchanged for non-bulk flows', () => {
    const prompt = buildDefinitionUserPrompt('barrio', 'city life', 'Chinese', 'Spanish');

    expect(prompt).toContain('Generate a clear definition for the word "barrio"');
    expect(prompt).toContain('context of "city life"');
    expect(prompt).not.toContain('Return exactly one concise line');
  });

  it('makes word-to-meaning grading explicitly accept a single valid gloss', () => {
    const prompt = buildValidationUserPrompt({
      userAnswer: '柔软的',
      correctAnswer: '柔软的/光滑的（soft / smooth）',
      question: 'Que significa "suave"?',
      context: 'General language exercise',
      baseLanguage: 'Chinese',
      targetLanguage: 'Spanish',
      direction: 'target_to_base'
    });

    expect(prompt).toContain('Accept the answer if it correctly states any one acceptable meaning or sense');
    expect(prompt).toContain('Do not require the learner to provide every listed sense');
    expect(prompt).toContain('Do not require the learner to repeat parenthetical English hints');
  });

  it('keeps meaning-to-word grading stricter about the study word', () => {
    const prompt = buildValidationUserPrompt({
      userAnswer: 'mojado',
      correctAnswer: 'mojado',
      question: 'Escribe la palabra en espanol que corresponde a "潮湿的（wet / damp）".',
      context: 'General language exercise',
      baseLanguage: 'Chinese',
      targetLanguage: 'Spanish',
      direction: 'base_to_target'
    });

    expect(prompt).toContain('Prefer lexical accuracy');
    expect(prompt).toContain('Do not accept a different synonym or a different listed word');
  });
});
