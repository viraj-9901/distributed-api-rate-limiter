import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IRateLimitRule extends Document {
    mode: String;
    limitPerMinute: number;
    limitPerHour: number;
    limitPerDay: number;
    windowType: String;
    active: boolean;
    createdBy: string;
}

const rateLimitRuleSchema: Schema = new Schema(
  {
    mode: {
        type: String,
        enum: ['ip', 'apiKey', 'user'],
        required: true,
        lowercase: true,
        index: true
    },
    limitPerMinute: {
        type: Number,
        min: 1,
        default: 100,
    },
    limitPerHour: {
        type: Number,
        min: 1,
        default: 1000,
    },
    limitPerDay: {
        type: Number,
        min: 1,
        default: 5000,
    },
    windowType: {
        type: String,
        enum: ['sliding', 'fixed'],
        default: 'sliding',
        lowercase: true,
    },
    active: {
        type: Boolean,
        default: true,
    },
    createdBy: {
        type: String,
        default: 'system',
    },
  },
    { timestamps: true }
);

rateLimitRuleSchema.index({ mode: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });

// Prevent multiple active rules for same mode
rateLimitRuleSchema.pre('save', async function (next) {
  if (this.isModified('active') && this.active) {
    await this.constructor.updateMany(
      { mode: this.mode, _id: { $ne: this._id } },
      { active: false }
    );
  }
});

export const RateLimitRule: Model<IRateLimitRule> = mongoose.model<IRateLimitRule>('RateLimitRule', rateLimitRuleSchema);