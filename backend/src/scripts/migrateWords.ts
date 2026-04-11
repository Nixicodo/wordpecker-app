import { connectDB, closeDB } from '../config/mongodb';
import { migrateLegacyLearningDataIfNeeded } from '../services/learningMigration';

const run = async () => {
  await connectDB(1, 100);

  try {
    const migrated = await migrateLegacyLearningDataIfNeeded();
    console.log(JSON.stringify({ migrated }, null, 2));
  } finally {
    await closeDB();
  }
};

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
