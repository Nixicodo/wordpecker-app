import { Agent } from '@openai/agents';
import { LanguageValidationResult } from './schemas';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL } from '../../config/openai';

// Load prompt from markdown file
const promptPath = path.join(__dirname, 'prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

export const languageValidationAgent = new Agent({
  name: 'Language Validation Agent',
  instructions: promptContent,
  model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  outputType: LanguageValidationResult,
  modelSettings: {
    temperature: 0.2,
    maxTokens: 500
  }
});
