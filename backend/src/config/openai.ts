import axios from 'axios';
import OpenAI from 'openai';

const DEEPSEEK_API_KEY = 'sk-d7a542ff10cc49598ee1963d09c610b9';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

export const DEFAULT_MODEL = DEEPSEEK_MODEL;
export const DEFAULT_IMAGE_MODEL = 'dall-e-3';

export const openai = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
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
    `${DEEPSEEK_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    },
  );

  return response.data;
}
