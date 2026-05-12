import mongoose, { Schema, Document } from 'mongoose';
import { ReviewRating } from '../learning-state/model';

export type DueReviewMode = 'meaning_to_word' | 'word_to_meaning';

export interface IDueReviewModeProgress {
  completed: boolean;
  hadError: boolean;
  rating?: ReviewRating;
  responseTimeMs?: number;
  usedHint?: boolean;
  questionType?: string;
  answeredAt?: Date;
  selfAssessedWordIds: mongoose.Types.ObjectId[];
}

export interface IDueReviewProgress extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  wordId: mongoose.Types.ObjectId;
  sourceListId: mongoose.Types.ObjectId;
  cycleKey: string;
  meaningToWord: IDueReviewModeProgress;
  wordToMeaning: IDueReviewModeProgress;
  settledAt?: Date;
  settledCorrect?: boolean;
  settledRating?: ReviewRating;
  createdAt: Date;
  updatedAt: Date;
}

const DueReviewModeProgressSchema = new Schema<IDueReviewModeProgress>({
  completed: {
    type: Boolean,
    required: true,
    default: false
  },
  hadError: {
    type: Boolean,
    required: true,
    default: false
  },
  rating: {
    type: String,
    enum: ['again', 'hard', 'good', 'easy'],
    default: undefined
  },
  responseTimeMs: {
    type: Number,
    default: undefined
  },
  usedHint: {
    type: Boolean,
    default: undefined
  },
  questionType: {
    type: String,
    trim: true,
    default: undefined
  },
  answeredAt: {
    type: Date,
    default: undefined
  },
  selfAssessedWordIds: {
    type: [Schema.Types.ObjectId],
    default: []
  }
}, { _id: false });

const DueReviewProgressSchema = new Schema<IDueReviewProgress>({
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
  sourceListId: {
    type: Schema.Types.ObjectId,
    ref: 'WordList',
    required: true
  },
  cycleKey: {
    type: String,
    required: true,
    trim: true
  },
  meaningToWord: {
    type: DueReviewModeProgressSchema,
    required: true,
    default: () => ({})
  },
  wordToMeaning: {
    type: DueReviewModeProgressSchema,
    required: true,
    default: () => ({})
  },
  settledAt: {
    type: Date,
    default: undefined
  },
  settledCorrect: {
    type: Boolean,
    default: undefined
  },
  settledRating: {
    type: String,
    enum: ['again', 'hard', 'good', 'easy'],
    default: undefined
  }
}, {
  timestamps: true
});

DueReviewProgressSchema.index({ userId: 1, wordId: 1, sourceListId: 1 }, { unique: true });
DueReviewProgressSchema.index({ userId: 1, cycleKey: 1, updatedAt: -1 });

export const DueReviewProgress = mongoose.model<IDueReviewProgress>('DueReviewProgress', DueReviewProgressSchema);
