import OpenAI from 'openai';
import { ZodSchema } from 'zod';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  return client;
}

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
  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.4',
    response_format: { type: 'json_object' },
    temperature,
    max_tokens: maxTokens,
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
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Model response was empty');
  }

  return schema.parse(JSON.parse(extractJson(content)));
}
