import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { environment } from './config/environment';
import { errorHandler } from './middleware/errorHandler';
import { openaiRateLimiter } from './middleware/rateLimiter';
import { connectDB } from './config/mongodb';
import { configureOpenAIAgents } from './agents';
import { restoreLearningSnapshotIfNeeded } from './services/repoLearningSnapshot';
import { migrateLegacyLearningDataIfNeeded } from './services/learningMigration';
import { backgroundLibrary } from './services/backgroundLibrary';

// Import routes
import listRoutes from './api/lists/routes';
import wordRoutes from './api/words/routes';
import learnRoutes from './api/learn/routes';
import quizRoutes from './api/quiz/routes';
import templateRoutes from './api/templates/routes';
import preferencesRoutes from './api/preferences/routes';
import imageDescriptionRoutes from './api/image-description/routes';
import vocabularyRoutes from './api/vocabulary/routes';
import languageValidationRoutes from './api/language-validation/routes';
import audioRoutes from './api/audio/routes';
import voiceRoutes from './api/voice/routes';
import backgroundRoutes from './api/backgrounds/routes';

const app = express();

// Global middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Apply rate limiter only to OpenAI-powered routes
app.use('/api/learn', openaiRateLimiter);
app.use('/api/quiz', openaiRateLimiter);
app.use('/api/describe', openaiRateLimiter);
app.use('/api/vocabulary', openaiRateLimiter);
app.use('/api/language-validation', openaiRateLimiter);
app.use('/api/audio', openaiRateLimiter); // Audio routes use ElevenLabs API
app.use('/api/voice', openaiRateLimiter); // Voice routes use OpenAI Realtime API

app.use(
  '/backgrounds',
  express.static(backgroundLibrary.getLibraryRoot(), {
    fallthrough: false,
    immutable: false,
    maxAge: environment.nodeEnv === 'production' ? '1h' : 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

// Routes
app.use('/api/lists', listRoutes);
app.use('/api/lists', wordRoutes);
app.use('/api/learn', learnRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/describe', imageDescriptionRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/language-validation', languageValidationRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/backgrounds', backgroundRoutes);

// Error handling
app.use(errorHandler);

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const PORT = environment.port;
  
  // Configure OpenAI agents and connect to MongoDB
  Promise.all([
    configureOpenAIAgents(),
    connectDB()
  ]).then(async () => {
    const restored = await restoreLearningSnapshotIfNeeded();
    if (restored) {
      console.log('Restored learning data from repository snapshot');
    }
    const migrated = await migrateLegacyLearningDataIfNeeded();
    if (migrated) {
      console.log('Migrated legacy learning data to the new scheduler model');
    }
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${environment.nodeEnv} mode`);
    });
  }).catch(error => {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  });
}

export default app; 
