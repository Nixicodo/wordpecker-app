import { isDeterministicallyCorrectAnswer, normalizeAnswerForComparison } from '../services/answerValidation';

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
    expect(isDeterministicallyCorrectAnswer('anno', 'año')).toBe(true);
  });

  it('handles ü character properly', () => {
    expect(isDeterministicallyCorrectAnswer('lingüista', 'linguista')).toBe(false);
    expect(isDeterministicallyCorrectAnswer('linguista', 'lingüista')).toBe(true);
  });
});
