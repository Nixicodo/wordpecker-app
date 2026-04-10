import { VocabularyResult, VocabularyResultType, VocabularyWordType } from '../../agents/vocabulary-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import * as fs from 'fs';
import * as path from 'path';

const vocabularyPrompt = fs.readFileSync(path.join(__dirname, '../../agents/vocabulary-agent/prompt.md'), 'utf-8');

export class VocabularyAgentService {
  async generateWords(count: number, difficulty: string, context: string, baseLanguage: string, targetLanguage: string, excludeWords: string[]): Promise<VocabularyWordType[]> {
    const prompt = `Generate ${count} ${difficulty}-level vocabulary words for the context "${context}". Generate words in ${targetLanguage} with definitions in ${baseLanguage}. Exclude these words: ${excludeWords.join(', ')}.`;
    const result = await generateStructuredResult<VocabularyResultType>({
      systemPrompt: vocabularyPrompt,
      userPrompt: prompt,
      schema: VocabularyResult,
      schemaHint: `{
  "words": Array<{
    "word": string,
    "meaning": string,
    "example": string,
    "difficulty_level": "basic" | "intermediate" | "advanced",
    "context": string | null
  }>
}`,
      temperature: 0.8,
      maxTokens: 3000,
    });
    return result.words;
  }

  async getWordDetails(word: string, context: string, baseLanguage: string, targetLanguage: string): Promise<VocabularyWordType> {
    const prompt = `Provide detailed information about the word "${word}" in the context of "${context}". The word is in ${targetLanguage} and the definition should be in ${baseLanguage}. The example sentence must be in ${targetLanguage}.`;
    const result = await generateStructuredResult<VocabularyResultType>({
      systemPrompt: vocabularyPrompt,
      userPrompt: prompt,
      schema: VocabularyResult,
      schemaHint: `{
  "words": Array<{
    "word": string,
    "meaning": string,
    "example": string,
    "difficulty_level": "basic" | "intermediate" | "advanced",
    "context": string | null
  }>
}`,
      temperature: 0.5,
      maxTokens: 1200,
    });
    return result.words[0]; // Get first word from response
  }
}

export const vocabularyAgentService = new VocabularyAgentService();
