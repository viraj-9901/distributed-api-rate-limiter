// Implements a token bucket rate limiter

import { Request, Response, NextFunction } from "express";

const DEFAULT_BUCKET_SIZE = 100;
const DEFAULT_REFILL_RATE = 1; // tokens per second
const DEFAULT_KEY_TTL_MS = 60 * 60 * 1000; // 1 hour

const buckets = new Map();

interface RateLimiterOptions {
  bucketSize?: number;
  refillRate?: number;
  keyTTL?: number;
  identifier?: (req: Request) => string;
  onError?: (req: Request, res: Response, err: unknown) => void;
}

const createTokenBucketLimiter = (options: RateLimiterOptions = {}) => {
    const {
        bucketSize = DEFAULT_BUCKET_SIZE,
        refillRate = DEFAULT_REFILL_RATE,
        keyTTL = DEFAULT_KEY_TTL_MS,
        identifier = (req) => req.ip,
        onError = (req, res, err) => {
        console.error(`Rate limiter error for ${identifier(req)}:`, err);
        },
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = identifier(req);
            if (!id) return next();

            const now = Date.now();
            let bucket = buckets.get(id);

            if (!bucket || bucket.expiresAt <= now) {
                bucket = {
                    tokens: bucketSize,
                    lastRefill: now,
                    expiresAt: now + keyTTL,
                };
            }

            const elapsedSeconds = (now - bucket.lastRefill) / 1000;
            bucket.tokens = Math.min(
                bucketSize,
                bucket.tokens + elapsedSeconds * refillRate
            );
            bucket.lastRefill = now;

            res.setHeader('X-RateLimit-Limit', bucketSize.toString());
            res.setHeader(
                'X-RateLimit-Remaining',
                Math.floor(bucket.tokens).toString()
            );

            const resetInSeconds =
                bucket.tokens >= 1
                ? 0
                : Math.ceil((1 - bucket.tokens) / refillRate);

            res.setHeader(
                'X-RateLimit-Reset',
                Math.ceil((now + resetInSeconds * 1000) / 1000).toString()
            );

            // Reject if empty
            if (bucket.tokens < 1) {
                return res.status(429).json({
                    error: 'Too Many Requests',
                    message: 'Rate limit exceeded. Try again later.',
                    retryAfter: resetInSeconds,
                });
            }

            // Consume token
            bucket.tokens -= 1;
            bucket.expiresAt = now + keyTTL;

            buckets.set(id, bucket);
            next();
        } catch (error) {
            onError(req, res, error);
            next();
        }
    }
}