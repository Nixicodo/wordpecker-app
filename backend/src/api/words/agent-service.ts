import { DefinitionResult, DefinitionResultType } from '../../agents/definition-agent/schemas';
import { ValidationResult, ValidationResultType } from '../../agents/validation-agent/schemas';
import { ExamplesResult, ExamplesResultType, SentenceExampleType } from '../../agents/examples-agent/schemas';
import { SimilarWordsResult, SimilarWordsResultType } from '../../agents/similar-words-agent/schemas';
import { ReadingResult, ReadingResultType } from '../../agents/reading-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import * as fs from 'fs';
import * as path from 'path';

const definitionPrompt = fs.readFileSync(path.join(__dirname, '../../agents/definition-agent/prompt.md'), 'utf-8');
const validationPrompt = fs.readFileSync(path.join(__dirname, '../../agents/validation-agent/prompt.md'), 'utf-8');
const examplesPrompt = fs.readFileSync(path.join(__dirname, '../../agents/examples-agent/prompt.md'), 'utf-8');
const similarWordsPrompt = fs.readFileSync(path.join(__dirname, '../../agents/similar-words-agent/prompt.md'), 'utf-8');
const readingPrompt = fs.readFileSync(path.join(__dirname, '../../agents/reading-agent/prompt.md'), 'utf-8');

export type DefinitionStyle = 'default' | 'compact_gloss';
export type ValidationDirection = 'target_to_base' | 'base_to_target';

export const buildDefinitionUserPrompt = (
  word: string,
  context: string,
  baseLanguage: string,
  targetLanguage: string,
  style: DefinitionStyle = 'default'
) => {
  const normalizedContext = context?.trim() || 'General language learning';

  if (style === 'compact_gloss') {
    return [
      `Generate a very short learner-friendly gloss for the word "${word}".`,
      `The word is in ${targetLanguage}, and the gloss must be in ${baseLanguage}.`,
      `Context: "${normalizedContext}".`,
      'Return exactly one concise line, not a paragraph.',
      'Prefer the format: short base-language meaning + optional part of speech + English hint in parentheses.',
      `Example target shape when base language is Chinese: "教堂（church）", "照片（photo / photograph）", "社区；街区（neighborhood / district）".`,
      'Keep the base-language meaning to a few words only.',
      'Do not add full-sentence explanations, usage notes, cultural background, examples, or extra punctuation beyond what the gloss needs.'
    ].join(' ');
  }

  return `Generate a clear definition for the word "${word}" in the context of "${normalizedContext}". The word is in ${targetLanguage} and the definition should be in ${baseLanguage}.`;
};

export const buildValidationUserPrompt = ({
  userAnswer,
  correctAnswer,
  question,
  context,
  baseLanguage,
  targetLanguage,
  direction,
}: {
  userAnswer: string;
  correctAnswer: string;
  question?: string;
  context: string;
  baseLanguage: string;
  targetLanguage: string;
  direction?: ValidationDirection;
}) => {
  const normalizedContext = context?.trim() || 'General language exercise';
  const normalizedQuestion = question?.trim();
  const directionLabel = direction
    ? `${direction}${direction === 'target_to_base' ? ' (word -> meaning)' : ' (meaning -> word)'}`
    : 'unknown';

  const sharedInstructions = [
    'Validate whether the learner answer should be accepted for this exercise.',
    `Learner answer: "${userAnswer}".`,
    `Reference answer: "${correctAnswer}".`,
    normalizedQuestion ? `Visible question: "${normalizedQuestion}".` : null,
    `Exercise context: "${normalizedContext}".`,
    `Learner base language: ${baseLanguage}. Target language being studied: ${targetLanguage}.`,
    `Exercise direction: ${directionLabel}.`,
  ].filter((line): line is string => Boolean(line));

  if (direction === 'target_to_base') {
    return [
      ...sharedInstructions,
      'Critical grading rules for word -> meaning questions:',
      '- The reference answer may be a compact glossary with multiple acceptable senses, slash-separated meanings, and parenthetical English hints.',
      '- Accept the answer if it correctly states any one acceptable meaning or sense from the reference answer.',
      '- Do not require the learner to provide every listed sense.',
      `- Do not require the learner to repeat parenthetical English hints if they already answered correctly in ${baseLanguage}.`,
      `- Likewise, if one of the provided parenthetical glosses is already a correct answer in another language such as English, that can still be accepted.`,
      '- Treat slash-separated glosses and parenthetical glosses as alternative acceptable answers, not cumulative requirements, unless the question explicitly asks for all meanings.',
      '- Prefer acceptance when the learner gives one clear core meaning that matches the reference answer.',
      'Return isValid true only if the learner answer should be accepted. Keep explanation brief and educational.',
    ].join(' ');
  }

  if (direction === 'base_to_target') {
    return [
      ...sharedInstructions,
      'Critical grading rules for meaning -> word questions:',
      '- Prefer lexical accuracy because the learner is expected to produce the target-language study word.',
      '- Accept minor formatting, capitalization, punctuation, or diacritic differences, and obvious inflection or spelling variants only when they still clearly identify the same target word.',
      '- Do not accept a different synonym or a different listed word merely because it is semantically related.',
      'Return isValid true only if the learner answer should be accepted. Keep explanation brief and educational.',
    ].join(' ');
  }

  return [
    ...sharedInstructions,
    'Critical grading rules:',
    '- Be semantically fair and context-aware.',
    '- If the reference answer includes multiple glosses or parenthetical hints, do not automatically require all of them.',
    'Return isValid true only if the learner answer should be accepted. Keep explanation brief and educational.',
  ].join(' ');
};

export class WordAgentService {
  async generateDefinition(
    word: string,
    context: string,
    baseLanguage: string,
    targetLanguage: string,
    style: DefinitionStyle = 'default'
  ): Promise<string> {
    const prompt = buildDefinitionUserPrompt(word, context, baseLanguage, targetLanguage, style);
    const result = await generateStructuredResult<DefinitionResultType>({
      systemPrompt: definitionPrompt,
      userPrompt: prompt,
      schema: DefinitionResult,
      schemaHint: `{"definition": string}`,
      temperature: 0.5,
      maxTokens: 200,
    });
    return result.definition;
  }

  async validateAnswer(
    userAnswer: string,
    correctAnswer: string,
    context: string,
    baseLanguage: string,
    targetLanguage: string,
    options?: { question?: string; direction?: ValidationDirection }
  ): Promise<ValidationResultType> {
    const prompt = buildValidationUserPrompt({
      userAnswer,
      correctAnswer,
      question: options?.question,
      context,
      baseLanguage,
      targetLanguage,
      direction: options?.direction,
    });
    return generateStructuredResult<ValidationResultType>({
      systemPrompt: validationPrompt,
      userPrompt: prompt,
      schema: ValidationResult,
      schemaHint: `{"isValid": boolean, "explanation": string | null}`,
      temperature: 0.2,
      maxTokens: 300,
      timeoutMs: 12000,
    });
  }

  async generateExamples(word: string, meaning: string, context: string, baseLanguage: string, targetLanguage: string): Promise<SentenceExampleType[]> {
    const prompt = `Generate 3-5 sentence examples for the word "${word}" with meaning "${meaning}" in the context of "${context}". Examples should be in ${targetLanguage} with explanations in ${baseLanguage}.`;
    const result = await generateStructuredResult<ExamplesResultType>({
      systemPrompt: examplesPrompt,
      userPrompt: prompt,
      schema: ExamplesResult,
      schemaHint: `{
  "examples": Array<{
    "sentence": string,
    "translation": string | null,
    "context_note": string
  }>
}`,
      temperature: 0.7,
      maxTokens: 800,
    });
    return result.examples;
  }

  async generateSimilarWords(word: string, meaning: string, context: string, baseLanguage: string, targetLanguage: string): Promise<SimilarWordsResultType> {
    const prompt = `Find similar words and synonyms for the word "${word}" with meaning "${meaning}" in the context of "${context}". Find words in ${targetLanguage} with definitions in ${baseLanguage}.`;
    return generateStructuredResult<SimilarWordsResultType>({
      systemPrompt: similarWordsPrompt,
      userPrompt: prompt,
      schema: SimilarWordsResult,
      schemaHint: `{
  "synonyms": Array<{ "word": string, "definition": string, "example": string, "usage_note": string }>,
  "interchangeable_words": Array<{ "word": string, "definition": string, "example": string, "usage_note": string }>
}`,
      temperature: 0.6,
      maxTokens: 1200,
    });
  }

  async generateLightReading(words: Array<{value: string, meaning: string}>, context: string, baseLanguage: string, targetLanguage: string): Promise<ReadingResultType> {
    const prompt = `Create an intermediate-level reading passage in ${targetLanguage} that incorporates these vocabulary words: ${words.map(w => `${w.value} (${w.meaning})`).join(', ')}. Context: "${context}". The passage should be suitable for ${baseLanguage} speakers learning ${targetLanguage}.`;
    return generateStructuredResult<ReadingResultType>({
      systemPrompt: readingPrompt,
      userPrompt: prompt,
      schema: ReadingResult,
      schemaHint: `{
  "title": string,
  "text": string,
  "highlighted_words": Array<{ "word": string, "definition": string, "position": number | null }>,
  "word_count": number,
  "difficulty_level": string,
  "theme": string
}`,
      temperature: 0.7,
      maxTokens: 1200,
    });
  }
}

export const wordAgentService = new WordAgentService();
