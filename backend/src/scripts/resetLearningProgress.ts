import { config } from 'dotenv';
import { closeDB, connectDB } from '../config/mongodb';
import { DEFAULT_USER_ID } from '../config/learning';
import { persistLearningSnapshot } from '../services/repoLearningSnapshot';
import { resetLearningProgress } from '../services/resetLearningProgress';

config();

const parseUserId = () => {
  const directArg = process.argv.find((arg) => arg.startsWith('--user-id='));
  if (directArg) {
    return directArg.slice('--user-id='.length) || DEFAULT_USER_ID;
  }

  const flagIndex = process.argv.findIndex((arg) => arg === '--user-id');
  if (flagIndex >= 0) {
    return process.argv[flagIndex + 1] || DEFAULT_USER_ID;
  }

  return DEFAULT_USER_ID;
};

const main = async () => {
  const userId = parseUserId();

  await connectDB();
  try {
    const result = await resetLearningProgress(userId);
    await persistLearningSnapshot();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDB();
  }
};

main().catch((error) => {
  console.error('Failed to reset learning progress:', error);
  process.exitCode = 1;
});
