import axios from 'axios';
import OpenAI from 'openai';
import { environment } from './environment';

if (!environment.openaiApiKey) {
  throw new Error('Missing OpenAI API key. Check OPENAI_API_KEY in .env');
}

export const DEFAULT_MODEL = environment.openaiModel;
export const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';

export const openai = new OpenAI({
  apiKey: environment.openaiApiKey,
  baseURL: environment.openaiBaseUrl,
});

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export async function createChatCompletion({
  model = DEFAULT_MODEL,
  messages,
  temperature,
  maxTokens,
}: {
  model?: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResponse> {
  const response = await axios.post<ChatCompletionResponse>(
    `${environment.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${environment.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    },
  );

  return response.data;
}
