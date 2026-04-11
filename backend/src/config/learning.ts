export const DEFAULT_USER_ID = 'local-ai-test-user';

export const resolveUserId = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] || DEFAULT_USER_ID;
  }

  return value || DEFAULT_USER_ID;
};
