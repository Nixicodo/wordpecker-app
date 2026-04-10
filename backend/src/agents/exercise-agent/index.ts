import { Agent } from '@openai/agents';
import { ExerciseResult } from './schemas';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL } from '../../config/openai';

// Load prompt from markdown file
const promptPath = path.join(__dirname, 'prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

export const exerciseAgent = new Agent({
  name: 'Exercise Agent',
  instructions: promptContent,
  model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  outputType: ExerciseResult,
  modelSettings: {
    temperature: 0.7,
    maxTokens: 2000
  }
});
