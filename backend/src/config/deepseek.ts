import axios from 'axios';

export const DEEPSEEK_API_KEY = 'sk-d7a542ff10cc49598ee1963d09c610b9';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const DEEPSEEK_MODEL = 'deepseek-v4-flash';

export interface ChatMessage {
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

export async function createDeepseekChatCompletion({
  model = DEEPSEEK_MODEL,
  messages,
  temperature,
  maxTokens,
}: {
  model?: string;
  messages: ChatMessage[];
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
