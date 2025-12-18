// Implements a sliding window rate limiter with bucket-based tracking

import { Request, Response, NextFunction } from "express";

let WINDOW_SIZE_MS = 60_000; //1 minute
let MAX_REQUESTS = 100; //max 100 requests per window
let BUCKET_COUNT = 12; 
let BUCKET_DURATION_MS = 5000; // WINDOW_SIZE_MS / BUCKET_COUNT = 60_000 / 12 = 5 requests per bucket

interface UserData {
    counts: number[];
    lastBucketIndex: number;
    // lastAccessTime: number;
}

const users = new Map<string, UserData>();

interface RateLimiterOptions {
    windowMs?: number;
    maxRequests?: number;
    bucketCount?: number;
    message?: string | ((req: Request, res: Response) => string);
    statusCode?: number;
    keyGenerator?: (req: Request) => string;
    headers?: boolean; // Send standard RateLimit headers
}

function createSlidingWindowLimiter(options: RateLimiterOptions = {}) {
    const windowMs = options.windowMs ?? WINDOW_SIZE_MS;
    const maxRequests = options.maxRequests ?? MAX_REQUESTS;
    const bucketCount = options.bucketCount ?? BUCKET_COUNT;
    const bucketMs = windowMs / bucketCount;
    const message = options.message ?? 'Too many requests, please try again later.';
    const statusCode = options.statusCode ?? 429;
    const headers = options.headers ?? true;

    const keyGenerator = options.keyGenerator ?? ((req: Request) => {
        // Use real client IP (handles proxies if app.set('trust proxy', true))
        return req.ip ?? 'unknown';
    });

    return function slidingWindowLimiter(req: Request, res: Response, next: NextFunction) {
        const key = keyGenerator(req);
        const now = Date.now();
        const currentBucketIndex = Math.floor((now / bucketMs) % bucketCount);

        let data = users.get(key);

        if (!data) {
            data = {
                counts: new Array(bucketCount).fill(0),
                lastBucketIndex: currentBucketIndex,
                // lastAccessTime: now
            };
            data.counts[currentBucketIndex] = 1;
            users.set(key, data);

            if (headers) sendHeaders(res, maxRequests, maxRequests - 1, windowMs, now);
            return next();
        }

        // const elapsedMs = now - data.lastAccessTime;

        const bucketDiff = (currentBucketIndex - data.lastBucketIndex + bucketCount) % bucketCount;

        // if (elapsedMs >= windowMs) {
        //     data.counts.fill(0);
        // } else {
        //     // Clear expired buckets
        //     const bucketsPassed = Math.floor(elapsedMs / bucketMs);
        //     for (let i = 1; i <= Math.min(bucketsPassed, bucketCount); i++) {
        //         const bucketToClear = (data.lastBucketIndex + i) % bucketCount;
        //         data.counts[bucketToClear] = 0;
        //     }
        // }

        if (bucketDiff > 0) {
            for (let i = 1; i <= bucketDiff; i++) {
                const idx = (data.lastBucketIndex + i) % bucketCount;
                data.counts[idx] = 0;
            }
        }

        // Calculate current total
        const totalRequests = data.counts.reduce((sum, c) => sum + c, 0);

        if (totalRequests >= maxRequests) {
            if (headers) {
                const resetTime = Math.ceil((Math.floor(now / windowMs) + 1) * windowMs / 1000);
                
                res.setHeader('Retry-After', Math.ceil(bucketMs / 1000));
                sendHeaders(res, maxRequests, 0, windowMs, resetTime);
            }

            return res.status(statusCode).json({
                error: typeof message === 'function' ? message(req, res) : message
            });
        }

        // Allow and increment
        data.counts[currentBucketIndex] += 1;
        data.lastBucketIndex = currentBucketIndex;

        const remaining = maxRequests - (totalRequests + 1);
        if (headers) sendHeaders(res, maxRequests, remaining, windowMs, now);

        next();

    }
}

function sendHeaders(res: Response, limit: number, remaining: number, windowMs: number, resetTime: number) {
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000)); // Unix timestamp
}