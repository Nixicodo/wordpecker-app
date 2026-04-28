import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGODB_URL) {
  throw new Error('Missing required environment variable: MONGODB_URL');
}

export const environment = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUrl: process.env.MONGODB_URL
} as const;
