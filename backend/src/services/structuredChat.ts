import { ZodSchema } from 'zod';
import { createChatCompletion, DEFAULT_MODEL } from '../config/openai';

function extractJson(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('Model did not return valid JSON content');
}

export async function generateStructuredResult<T>({
  systemPrompt,
  userPrompt,
  schema,
  schemaHint,
  temperature = 0.3,
  maxTokens,
}: {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  schemaHint: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const response = await createChatCompletion({
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    temperature,
    messages: [
      {
        role: 'system',
        content: `${systemPrompt}\n\nReturn JSON only. Do not wrap the JSON in markdown fences.\nRequired JSON shape:\n${schemaHint}`,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    maxTokens,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Model response was empty');
  }

  return schema.parse(JSON.parse(extractJson(content)));
}
