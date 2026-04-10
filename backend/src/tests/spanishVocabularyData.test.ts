import {
  buildSpanishVocabularyListName,
  loadSpanishVocabularyLevels
} from '../scripts/spanishVocabularyData';

describe('spanish vocabulary import data', () => {
  it('loads all 11 levels and exposes chinese translations', () => {
    const levels = loadSpanishVocabularyLevels();

    expect(Array.from(levels.keys()).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(levels.get(0)).toHaveLength(198);
    expect(levels.get(1)).toHaveLength(180);
    expect(levels.get(10)).toHaveLength(180);

    const hello = levels.get(0)?.find((entry) => entry.spanish === 'hola');
    expect(hello?.english).toBe('hello');
    expect(hello?.chinese).toBeTruthy();

    expect(buildSpanishVocabularyListName(0)).toBe('西语3k词-Level0-Pre-A1');
    expect(buildSpanishVocabularyListName(6)).toBe('西语3k词-Level6-A2');
    expect(buildSpanishVocabularyListName(7)).toBe('西语3k词-Level7-B1');
  });
});
