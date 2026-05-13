import {
  extractMeaningAnswerCandidates,
  isDeterministicallyCorrectAnswer,
  isDeterministicallyCorrectMeaningAnswer,
  normalizeAnswerForComparison
} from '../services/answerValidation';

describe('answerValidation', () => {
  it('normalizes punctuation spacing and width variants', () => {
    expect(normalizeAnswerForComparison(' la cuenta， por favor ')).toBe('la cuenta,por favor');
    expect(normalizeAnswerForComparison('la cuenta,por favor')).toBe('la cuenta,por favor');
  });

  it('accepts answers that only differ by punctuation spacing', () => {
    expect(isDeterministicallyCorrectAnswer('la cuenta,por favor', 'la cuenta, por favor')).toBe(true);
  });

  it('rejects different answers after normalization', () => {
    expect(isDeterministicallyCorrectAnswer('la mesa, por favor', 'la cuenta, por favor')).toBe(false);
  });

  it('accepts answers that match an accented correct answer after diacritics removal', () => {
    expect(isDeterministicallyCorrectAnswer('practico', 'práctico')).toBe(true);
  });

  it('accepts answers with multiple accented characters', () => {
    expect(isDeterministicallyCorrectAnswer('comunicacion', 'comunicación')).toBe(true);
  });

  it('still accepts exact accented match without diacritics removal path', () => {
    expect(isDeterministicallyCorrectAnswer('práctico', 'práctico')).toBe(true);
  });

  it('rejects answers that are still different after diacritics removal', () => {
    expect(isDeterministicallyCorrectAnswer('practica', 'práctico')).toBe(false);
  });

  it('handles ñ character properly', () => {
    expect(isDeterministicallyCorrectAnswer('ano', 'año')).toBe(true);
  });

  it('handles ü character properly', () => {
    expect(isDeterministicallyCorrectAnswer('lingüista', 'linguista')).toBe(false);
    expect(isDeterministicallyCorrectAnswer('linguista', 'lingüista')).toBe(true);
  });

  it('extracts alternative gloss candidates from slash-separated meanings and parenthetical hints', () => {
    expect(extractMeaningAnswerCandidates('柔软的/光滑的（soft / smooth）')).toEqual(
      expect.arrayContaining(['柔软的', '柔软', '光滑的', '光滑', 'soft', 'smooth'])
    );
  });

  it('accepts one Chinese sense from a multi-sense glossary answer', () => {
    expect(isDeterministicallyCorrectMeaningAnswer('柔软的', '柔软的/光滑的（soft / smooth）')).toBe(true);
  });

  it('accepts one English gloss from parenthetical hints', () => {
    expect(isDeterministicallyCorrectMeaningAnswer('smooth', '柔软的/光滑的（soft / smooth）')).toBe(true);
  });

  it('accepts a Chinese-only answer when the reference also includes English hints', () => {
    expect(isDeterministicallyCorrectMeaningAnswer('潮湿的', '潮湿的（wet / damp）')).toBe(true);
  });

  it('rejects unrelated meanings even for glossary-style answers', () => {
    expect(isDeterministicallyCorrectMeaningAnswer('明亮的', '柔软的/光滑的（soft / smooth）')).toBe(false);
  });
});
