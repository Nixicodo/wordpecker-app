import {
  buildDiscoveryExplanationPrompt,
  buildMexicanUsageExplanation
} from '../services/spanishDiscoveryContent';

describe('spanish discovery explanation helpers', () => {
  it('builds a plain fallback explanation without copying machine context labels', () => {
    expect(
      buildMexicanUsageExplanation(
        '\u4eab\u53d7\uff08enjoy\uff09',
        'Mexican Spanish frequency vocabulary level 0 (Pre-A1)'
      )
    ).toBe('\u4eab\u53d7\u3002');
  });

  it('asks the model for a direct explanation without boilerplate phrases', () => {
    const prompt = buildDiscoveryExplanationPrompt([
      {
        word: 'disfrutar',
        meaning: '\u4eab\u53d7\uff08enjoy\uff09',
        context: 'Mexican Spanish frequency vocabulary level 0 (Pre-A1)'
      }
    ]);

    expect(prompt).toContain('\u76f4\u63a5\u89e3\u91ca');
    expect(prompt).toContain('\u4e0d\u8981\u5199\u201c\u58a8\u897f\u54e5\u5e38\u7528\u201d');
    expect(prompt).toContain('\u58a8\u897f\u54e5\u897f\u73ed\u7259\u8bed\u65e5\u5e38\u4ea4\u6d41');
    expect(prompt).not.toContain('Mexican Spanish frequency vocabulary level 0 (Pre-A1)');
  });
});
