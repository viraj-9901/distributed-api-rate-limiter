//Sliding Window Rate Limiter Middleware
let windowSize = 60000; //1 minute
let maxRequests = 100; //max 100 requests per window
let bucketNumber = 12;
let bucketSize = 5000; // windowSize / bucketNumber = 60000 / 12 = 5000 requests per bucket

interface UserData {
    counts: number[];
    lastBucketIndex: number;
    lastAccessTime: number;
}

const users = new Map<string, UserData>();

function allowRequest(userId: string): boolean {
    const currentTime = Date.now();
    const currentBucketIndex = Math.floor((currentTime / bucketSize) % bucketNumber);

    if (!users.has(userId)) {
        const data: UserData = {
            counts: new Array(bucketNumber).fill(0),
            lastBucketIndex: currentBucketIndex,
            lastAccessTime: currentTime
        };
        data.counts[currentBucketIndex] = 1;
        users.set(userId, data);
        return true;
    }

    const data = users.get(userId)!;
    const timePassed = currentTime - data.lastAccessTime;

    // Reset all buckets if entire window has passed
    if (timePassed >= windowSize) {
        data.counts.fill(0);
    } else {
        // Clear buckets that have expired since last access
        const bucketsPassed = Math.floor(timePassed / bucketSize);
        for (let i = 1; i <= Math.min(bucketsPassed, bucketNumber); i++) {
            const bucketToClear = (data.lastBucketIndex + i) % bucketNumber;
            data.counts[bucketToClear] = 0;
        }
    }

    // Count total requests in window
    const totalRequests = data.counts.reduce((sum, count) => sum + count, 0);

    // Check if request is allowed before incrementing
    if (totalRequests >= maxRequests) {
        return false;
    }

    // Allow request and update state
    data.counts[currentBucketIndex] += 1;
    data.lastBucketIndex = currentBucketIndex;
    data.lastAccessTime = currentTime;

    return true;
}