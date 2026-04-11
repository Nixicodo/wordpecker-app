import mongoose, { Schema, Document } from 'mongoose';
import { ReviewRating, ReviewSource } from '../learning-state/model';

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
  answeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
    enum: ['learn', 'quiz', 'mistake_review'],
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
  answeredAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

ReviewLogSchema.index({ userId: 1, listId: 1, answeredAt: -1 });
ReviewLogSchema.index({ userId: 1, wordId: 1, answeredAt: -1 });

export const ReviewLog = mongoose.model<IReviewLog>('ReviewLog', ReviewLogSchema);
