import {
  assertMeaningEncoding,
  extractPlaceholderMeaningEnglish,
  isLikelyCorruptedMeaning
} from '../utils/meaningEncoding';

describe('meaningEncoding', () => {
  it('flags mojibake-like meanings that replaced non-ascii characters with question marks', () => {
    expect(isLikelyCorruptedMeaning('?/???to give?')).toBe(true);
    expect(isLikelyCorruptedMeaning('??/???to remember / remind?')).toBe(true);
    expect(isLikelyCorruptedMeaning('???red?')).toBe(true);
    expect(isLikelyCorruptedMeaning('?（ticket）')).toBe(true);
    expect(isLikelyCorruptedMeaning('??（week）')).toBe(true);
  });

  it('flags replacement characters directly', () => {
    expect(isLikelyCorruptedMeaning('\u7ed9\uFFFD(to give)')).toBe(true);
  });

  it('does not flag valid meanings', () => {
    expect(isLikelyCorruptedMeaning('\u7ed9\uFF08to give\uFF09')).toBe(false);
    expect(isLikelyCorruptedMeaning('\u7b49\u5f85/\u5e0c\u671b\uFF08to wait / hope\uFF09')).toBe(false);
    expect(isLikelyCorruptedMeaning('What?')).toBe(false);
    expect(isLikelyCorruptedMeaning('\u7968\uFF08ticket\uFF09')).toBe(false);
  });

  it('throws when corrupted meanings are asserted', () => {
    expect(() => assertMeaningEncoding('?/???to give?')).toThrow(
      'Meaning appears to contain encoding corruption. Please re-enter it using UTF-8 text.'
    );
  });

  it('extracts the english gloss from placeholder meanings', () => {
    expect(extractPlaceholderMeaningEnglish('?（ticket）')).toBe('ticket');
    expect(extractPlaceholderMeaningEnglish('??（week）')).toBe('week');
    expect(extractPlaceholderMeaningEnglish('\u7968\uFF08ticket\uFF09')).toBeNull();
  });
});
