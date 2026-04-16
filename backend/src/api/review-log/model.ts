import mongoose, { Schema, Document } from 'mongoose';
import { ReviewRating, ReviewSource } from '../learning-state/model';

export interface IReviewStateSnapshot {
  dueAt: Date;
  lastReviewedAt?: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  lastRating?: ReviewRating;
  lastSource?: ReviewSource;
}

export interface IReviewLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  wordId: mongoose.Types.ObjectId;
  listId: mongoose.Types.ObjectId;
  source: ReviewSource;
  questionType: string;
  rating: ReviewRating;
  correct: boolean;
  responseTimeMs?: number;
  usedHint?: boolean;
  settlementKey?: string;
  answeredAt: Date;
  stateBefore?: IReviewStateSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewStateSnapshotSchema = new Schema<IReviewStateSnapshot>({
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
    required: true
  },
  difficulty: {
    type: Number,
    required: true
  },
  scheduledDays: {
    type: Number,
    required: true
  },
  elapsedDays: {
    type: Number,
    required: true
  },
  reps: {
    type: Number,
    required: true
  },
  lapses: {
    type: Number,
    required: true
  },
  learningSteps: {
    type: Number,
    required: true
  },
  state: {
    type: Number,
    required: true
  },
  reviewCount: {
    type: Number,
    required: true
  },
  lapseCount: {
    type: Number,
    required: true
  },
  consecutiveCorrect: {
    type: Number,
    required: true
  },
  consecutiveWrong: {
    type: Number,
    required: true
  },
  lastRating: {
    type: String,
    enum: ['again', 'hard', 'good', 'easy'],
    default: undefined
  },
  lastSource: {
    type: String,
    enum: ['learn', 'quiz', 'mistake_review', 'due_review'],
    default: undefined
  }
}, { _id: false });

const ReviewLogSchema = new Schema<IReviewLog>({
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
  source: {
    type: String,
    enum: ['learn', 'quiz', 'mistake_review', 'due_review'],
    required: true
  },
  questionType: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: String,
    enum: ['again', 'hard', 'good', 'easy'],
    required: true
  },
  correct: {
    type: Boolean,
    required: true
  },
  responseTimeMs: {
    type: Number,
    default: undefined
  },
  usedHint: {
    type: Boolean,
    default: undefined
  },
  settlementKey: {
    type: String,
    trim: true,
    default: undefined
  },
  answeredAt: {
    type: Date,
    required: true
  },
  stateBefore: {
    type: ReviewStateSnapshotSchema,
    default: undefined
  }
}, {
  timestamps: true
});

ReviewLogSchema.index({ userId: 1, listId: 1, answeredAt: -1 });
ReviewLogSchema.index({ userId: 1, wordId: 1, answeredAt: -1 });
ReviewLogSchema.index(
  { userId: 1, source: 1, settlementKey: 1, wordId: 1, listId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      settlementKey: { $exists: true, $type: 'string' }
    }
  }
);

export const ReviewLog = mongoose.model<IReviewLog>('ReviewLog', ReviewLogSchema);
