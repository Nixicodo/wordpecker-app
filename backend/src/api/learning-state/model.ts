import mongoose, { Schema, Document } from 'mongoose';
import { State } from 'ts-fsrs';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewSource = 'learn' | 'quiz' | 'mistake_review';

export interface ILearningState extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  wordId: mongoose.Types.ObjectId;
  listId: mongoose.Types.ObjectId;
  dueAt: Date;
  lastReviewedAt?: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: State;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  lastRating?: ReviewRating;
  lastSource?: ReviewSource;
  createdAt: Date;
  updatedAt: Date;
}

const LearningStateSchema = new Schema<ILearningState>({
  userId: {
    type: String,
    required: true,
    trim: true
  },
  wordId: {
    type: Schema.Types.ObjectId,
    ref: 'Word',
    required: true
  },
  listId: {
    type: Schema.Types.ObjectId,
    ref: 'WordList',
    required: true
  },
  dueAt: {
    type: Date,
    required: true
  },
  lastReviewedAt: {
    type: Date,
    default: undefined
  },
  stability: {
    type: Number,
    required: true,
    default: 0
  },
  difficulty: {
    type: Number,
    required: true,
    default: 0
  },
  scheduledDays: {
    type: Number,
    required: true,
    default: 0
  },
  elapsedDays: {
    type: Number,
    required: true,
    default: 0
  },
  reps: {
    type: Number,
    required: true,
    default: 0
  },
  lapses: {
    type: Number,
    required: true,
    default: 0
  },
  learningSteps: {
    type: Number,
    required: true,
    default: 0
  },
  state: {
    type: Number,
    enum: [State.New, State.Learning, State.Review, State.Relearning],
    required: true,
    default: State.New
  },
  reviewCount: {
    type: Number,
    required: true,
    default: 0
  },
  lapseCount: {
    type: Number,
    required: true,
    default: 0
  },
  consecutiveCorrect: {
    type: Number,
    required: true,
    default: 0
  },
  consecutiveWrong: {
    type: Number,
    required: true,
    default: 0
  },
  lastRating: {
    type: String,
    enum: ['again', 'hard', 'good', 'easy'],
    default: undefined
  },
  lastSource: {
    type: String,
    enum: ['learn', 'quiz', 'mistake_review'],
    default: undefined
  }
}, {
  timestamps: true
});

LearningStateSchema.index({ userId: 1, wordId: 1, listId: 1 }, { unique: true });
LearningStateSchema.index({ userId: 1, listId: 1, dueAt: 1 });

export const LearningState = mongoose.model<ILearningState>('LearningState', LearningStateSchema);
