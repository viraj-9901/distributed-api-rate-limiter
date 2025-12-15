import mongoose, { Schema, Model, Document } from "mongoose";

export interface IRateLimitLog extends Document {
    timestamp: Date;
    mode: string;
    identifier: string;
    requestsInWindow: number;
    windowSeconds: number;
    exceeded: boolean;
    action: string;
    endpoint: string;
    method?: string;
    userAgent?: string;
    ip?: string;
    apiKeyHash?: string;
    violatedWindow?: string | null;
}

const rateLimitLogSchema: Schema = new Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
      expires: '90d', // Auto-delete logs after 90 days
    },
    mode: {
      type: String,
      enum: ['ip', 'apikey', 'user'],
      required: true,
      index: true,
    },
    // The actual identifier being limited
    identifier: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Number of requests in the client has made in the current window
    requestsInWindow: {
      type: Number,
      min: 1,
      required: true,
    },
    // Which time window was checked (60, 3600, 86400)
    windowSeconds: {
      type: Number,
      enum: [60, 3600, 86400],
      required: true,
    },
    // Did this request exceed any limit?
    exceeded: {
      type: Boolean,
      required: true,
      index: true,
    },
    // allowed | blocked
    action: {
      type: String,
      enum: ['allowed', 'blocked'],
      required: true,
      index: true,
    },
    // Additional context
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      uppercase: true,
      maxlength: 10,
    },
    userAgent: String,
    ip: String,
    apiKeyHash: String, // optional: store hashed key for analytics
    // Optional: which specific limit was hit
    violatedWindow: {
      type: String,
      enum: ['minute', 'hour', 'day', null],
    },
 },
    { timestamps: false }
);

rateLimitLogSchema.index({ mode: 1, identifier: 1, timestamp: -1 });
rateLimitLogSchema.index({ action: 1, timestamp: -1 });
rateLimitLogSchema.index({ timestamp: -1 });

export const RateLimitLog: Model<IRateLimitLog> = mongoose.model<IRateLimitLog>(
  "RateLimitLog",
  rateLimitLogSchema
);