import { buildDefinitionUserPrompt } from '../api/words/agent-service';

describe('buildDefinitionUserPrompt', () => {
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
});
