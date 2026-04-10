import { Agent } from '@openai/agents';
import { ReadingResult } from './schemas';
import * as fs from 'fs';
import * as path from 'path';

// Load prompt from markdown file
const promptPath = path.join(__dirname, 'prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

export const readingAgent = new Agent({
  name: 'Reading Agent',
  instructions: promptContent,
  model: process.env.OPENAI_MODEL || 'gpt-5.4',
  outputType: ReadingResult,
  modelSettings: {
    temperature: 0.8,
    maxTokens: 1500
  }
});
