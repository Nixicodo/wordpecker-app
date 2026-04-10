import 'dotenv/config';

export async function configureOpenAIAgents(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL || 'gpt-5.4';

  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const { setDefaultModelProvider } = await import('@openai/agents');
    const { setDefaultOpenAIKey, OpenAIProvider } = await import('@openai/agents-openai');

    setDefaultOpenAIKey(apiKey);
    setDefaultModelProvider(new OpenAIProvider({
      apiKey,
      baseURL,
      useResponses: false,
    }));
    process.env.OPENAI_MODEL = model;
  } catch (error) {
    console.error('Error loading @openai/agents:', error);
    process.exit(1);
  }
}
