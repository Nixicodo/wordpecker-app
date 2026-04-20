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
});
