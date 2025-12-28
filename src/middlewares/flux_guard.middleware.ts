// Implements a sliding window rate limiter with bucket-based tracking

import { Request, Response, NextFunction } from "express";
import redisClient from "../infra/redis/redisClient";

let WINDOW_SIZE_MS = 60_000; //1 minute
let MAX_REQUESTS = 100; //max 100 requests per window
let BUCKET_COUNT = 12; 
let BUCKET_DURATION_MS = 5000; // WINDOW_SIZE_MS / BUCKET_COUNT = 60_000 / 12 = 5 requests per bucket

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
    const redis = redisClient;

    const keyGenerator = options.keyGenerator ?? ((req: Request) => {
        // Use real client IP (handles proxies if app.set('trust proxy', true))
        return req.ip ?? 'unknown';
    });

    return async function slidingWindowLimiter(req: Request, res: Response, next: NextFunction) {
        const userKey = keyGenerator(req);
        const redisKey = `ratelimit:${userKey}`;
        const now = Date.now();
        const currentBucketIndex = Math.floor((now / bucketMs) % bucketCount);
        try {
            const rawData = await redis.hgetall(redisKey);
            let data: Record<string, string> | null = null;
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                data = rawData as Record<string, string>;
            }

            let pipeline = redis.multi();
            let updates: Record<string, string> = {};
            let totalRequests = 0;
            let counts: number[] = new Array(bucketCount).fill(0);
            let shouldExpire = false;

            let isNewUser = !data || Object.keys(data).length === 0; 

            if(isNewUser){  
                // updates[`bucket_${currentBucketIndex}`] = '1';
                // updates.lastBucketIndex = currentBucketIndex.toString();
                // await redis.hset(redisKey, updates);
                // await redis.expire(redisKey, Math.ceil(windowMs / 1000));
                pipeline.hset(redisKey, `bucket_${currentBucketIndex}`, '1');
                pipeline.hset(redisKey, 'lastBucketIndex', currentBucketIndex.toString());
                pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
                shouldExpire = true;

                await redis.exec();

                const resetTime =  (Math.floor(now/windowMs) + 1) * windowMs;
                if (headers) sendHeaders(res, maxRequests, maxRequests - 1, windowMs, resetTime);
                return next();
            }

            for (let i = 0; i < bucketCount; i++) {
                const field = `bucket_${i}`;
                const val = data![field];
                counts[i] = val ? parseInt(val, 10) : 0;
            }
            const lastBucketIndexStr = data!.lastBucketIndex;
            const lastBucketIndex = lastBucketIndexStr ? parseInt(lastBucketIndexStr, 10) : 0;
            const bucketDiff = (currentBucketIndex - lastBucketIndex + bucketCount) % bucketCount;


            if (bucketDiff > 0) {
                for (let i = 1; i <= bucketDiff; i++) {
                    const idx = (lastBucketIndex + i) % bucketCount;
                    counts[idx] = 0;
                    // updates[`bucket_${idx}`] = '0';
                    pipeline.hset(redisKey, `bucket_${idx}`, '0');
                }
            }

            // Calculate current total
            totalRequests = counts.reduce((sum, count) => sum + count, 0);
            // updates.lastBucketIndex = currentBucketIndex.toString();
            pipeline.hset(redisKey, 'lastBucketIndex', currentBucketIndex.toString());
            if (totalRequests >= maxRequests) {

                await redis.hset(redisKey, updates);
                await redis.expire(redisKey, Math.ceil(windowMs / 1000));

                const resetTime =  (Math.floor(now/windowMs) + 1) * windowMs;

                if (headers) {
                    res.setHeader('Retry-After', Math.ceil(resetTime - now / 1000));
                    sendHeaders(res, maxRequests, 0, windowMs, resetTime);
                }

                return res.status(statusCode).json({
                    error: typeof message === 'function' ? message(req, res) : message
                });
            }

            // Allow and increment
            counts[currentBucketIndex] += 1;

            // updates[`bucket_${currentBucketIndex}`] = counts[currentBucketIndex].toString();
            pipeline.hset(redisKey, `bucket_${currentBucketIndex}`, counts[currentBucketIndex].toString());

            // await redis.hset(redisKey, updates);
            // await redis.expire(redisKey, Math.ceil(windowMs / 1000));

            if (!shouldExpire) {
                pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
            }
            await pipeline.exec();
            
            const remaining = maxRequests - (totalRequests + 1);
            const resetTime = (Math.floor(now / windowMs) + 1) * windowMs;
            if (headers) sendHeaders(res, maxRequests, remaining, windowMs, resetTime);

            next();
        } catch(err) {
            console.error('Rate limiter error:', err);
            next();
        }
    }
}

function sendHeaders(res: Response, limit: number, remaining: number, windowMs: number, resetTime: number) {
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000)); // Unix timestamp
}