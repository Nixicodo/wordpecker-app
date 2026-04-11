import mongoose, { Schema, Document } from 'mongoose';

export interface IWordListMembership {
  listId: mongoose.Types.ObjectId;
  meaning: string;
  sourceListIds?: mongoose.Types.ObjectId[];
  tags?: string[];
  addedAt?: Date;
  updatedAt?: Date;
}

export interface ILegacyWordContext {
  listId: mongoose.Types.ObjectId;
  meaning: string;
  learnedPoint?: number;
  wrongCount?: number;
  sourceListIds?: mongoose.Types.ObjectId[];
  lastWrongAt?: Date;
}

export interface IWord extends Document {
  _id: mongoose.Types.ObjectId;
  value: string;
  listMemberships: IWordListMembership[];
  ownedByLists?: ILegacyWordContext[];
  created_at: Date;
  updated_at: Date;
}

const WordListMembershipSchema = new Schema<IWordListMembership>({
  listId: {
    type: Schema.Types.ObjectId,
    ref: 'WordList',
    required: true
  },
  meaning: {
    type: String,
    required: true,
    trim: true
  },
  sourceListIds: {
    type: [Schema.Types.ObjectId],
    default: undefined
  },
  tags: {
    type: [String],
    default: undefined
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const LegacyWordContextSchema = new Schema<ILegacyWordContext>({
  listId: {
    type: Schema.Types.ObjectId,
    ref: 'WordList',
    required: true
  },
  meaning: {
    type: String,
    required: true,
    trim: true
  },
  learnedPoint: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  wrongCount: {
    type: Number,
    default: 0,
    min: 0
  },
  sourceListIds: {
    type: [Schema.Types.ObjectId],
    default: undefined
  },
  lastWrongAt: {
    type: Date,
    default: undefined
  }
}, { _id: false });

const WordSchema = new Schema<IWord>({
  value: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    unique: true
  },
  listMemberships: {
    type: [WordListMembershipSchema],
    default: []
  },
  // Temporary legacy field kept only for one-way migration.
  ownedByLists: {
    type: [LegacyWordContextSchema],
    default: undefined
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

export const Word = mongoose.model<IWord>('Word', WordSchema);
