import 'dotenv/config';
import { DEFAULT_MODEL } from '../config/openai';

const DEEPSEEK_API_KEY = 'sk-d7a542ff10cc49598ee1963d09c610b9';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export async function configureOpenAIAgents(): Promise<void> {
  try {
    const { setDefaultModelProvider } = await import('@openai/agents');
    const { setDefaultOpenAIKey, OpenAIProvider } = await import('@openai/agents-openai');

    setDefaultOpenAIKey(DEEPSEEK_API_KEY);
    setDefaultModelProvider(new OpenAIProvider({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
      useResponses: false,
    }));
    process.env.OPENAI_MODEL = DEFAULT_MODEL;
  } catch (error) {
    console.error('Error loading @openai/agents:', error);
    process.exit(1);
  }
}
