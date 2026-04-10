import { Router } from 'express';
import { LanguageValidationResult, LanguageValidationResultType } from '../../agents/language-validation-agent/schemas';
import { generateStructuredResult } from '../../services/structuredChat';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const promptPath = path.join(__dirname, '../../agents/language-validation-agent/prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

router.post('/validate', async (req, res) => {
  try {
    const { language } = req.body;

    if (!language || typeof language !== 'string') {
      return res.status(400).json({ 
        error: 'Language name is required and must be a string' 
      });
    }

    const validationResult = await generateStructuredResult<LanguageValidationResultType>({
      systemPrompt: promptContent,
      userPrompt: language.trim(),
      schema: LanguageValidationResult,
      schemaHint: `{
  "isValid": boolean,
  "languageCode": string | null,
  "standardizedName": string | null,
  "parameters": Array<{
    "type": "script" | "dialect" | "formality" | "region" | "learning_focus",
    "value": string,
    "description": string
  }> | null,
  "explanation": string | null
}`,
      temperature: 0.2,
      maxTokens: 500,
    });

    res.json(validationResult);
  } catch (error) {
    console.error('Error validating language:', error);
    res.status(500).json({ 
      error: 'Failed to validate language' 
    });
  }
});

export default router;
