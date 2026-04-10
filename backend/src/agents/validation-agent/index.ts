import { Agent } from '@openai/agents';
import { ValidationResult } from './schemas';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL } from '../../config/openai';

// Load prompt from markdown file
const promptPath = path.join(__dirname, 'prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

export const validationAgent = new Agent({
  name: 'Validation Agent',
  instructions: promptContent,
  model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  outputType: ValidationResult,
  modelSettings: {
    temperature: 0.3,
    maxTokens: 300
  }
});
