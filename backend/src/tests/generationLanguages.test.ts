import { resolveGenerationLanguages } from '../services/generationLanguages';

describe('resolveGenerationLanguages', () => {
  it('upgrades legacy english defaults to Chinese and Spanish when the word data clearly indicates that pair', () => {
    expect(resolveGenerationLanguages(
      { baseLanguage: 'en', targetLanguage: 'English' },
      [
        { value: 'allí', meaning: '那里' },
        { value: 'sin', meaning: '没有/不带' }
      ]
    )).toEqual({
      baseLanguage: 'Simplified Chinese',
      targetLanguage: 'Latin American Spanish'
    });
  });

  it('keeps explicit user languages when the data does not indicate the legacy fallback case', () => {
    expect(resolveGenerationLanguages(
      { baseLanguage: 'German', targetLanguage: 'French' },
      [{ value: 'bonjour', meaning: 'hallo' }]
    )).toEqual({
      baseLanguage: 'German',
      targetLanguage: 'French'
    });
  });
});
