import { assertMeaningEncoding, isLikelyCorruptedMeaning } from '../utils/meaningEncoding';

describe('meaningEncoding', () => {
  it('flags mojibake-like meanings that replaced non-ascii characters with question marks', () => {
    expect(isLikelyCorruptedMeaning('?/???to give?')).toBe(true);
    expect(isLikelyCorruptedMeaning('??/???to remember / remind?')).toBe(true);
    expect(isLikelyCorruptedMeaning('???red?')).toBe(true);
  });

  it('flags replacement characters directly', () => {
    expect(isLikelyCorruptedMeaning('给�(to give)')).toBe(true);
  });

  it('does not flag valid meanings', () => {
    expect(isLikelyCorruptedMeaning('给（to give）')).toBe(false);
    expect(isLikelyCorruptedMeaning('等待/希望（to wait / hope）')).toBe(false);
    expect(isLikelyCorruptedMeaning('What?')).toBe(false);
  });

  it('throws when corrupted meanings are asserted', () => {
    expect(() => assertMeaningEncoding('?/???to give?')).toThrow(
      'Meaning appears to contain encoding corruption. Please re-enter it using UTF-8 text.'
    );
  });
});
