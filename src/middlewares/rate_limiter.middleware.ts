//Sliding Window Rate Limiter Middleware
let windowSize = 60000; //1 minute
let maxRequests = 100; //max 100 requests per window
let bucketNumber = 12;
let bucketSize = 5; // windowSize / bucketNumber = 60 / 12 = 5 requests per bucket

let users = new Map(); //userId -> buffer

function allowRequest(userId: string): boolean {
    let currentTime = Date.now();
    let currentBucketIndex = Math.floor((currentTime / bucketSize) % bucketNumber);
    
    let data = users.get(userId);
    if(!users.has(userId)){
        let buckets = { counts: new Array(bucketNumber).fill(0), lastAccessed: currentTime };
        buckets.counts[currentBucketIndex] = 1;
        users.set(userId, buckets);
        return true;
    }

    const timePassed = currentTime - data.lastAccessed;
    if(timePassed >= windowSize){
        data.counts.fill(0);
    }

    const buckets = users.get(userId);
    //Reset old bucket
    buckets.counts[currentBucketIndex] = 0;

    for(let i = 1; i < bucketNumber; i++){
        const offset = (currentBucketIndex - i + bucketNumber) % bucketNumber;
        const bucketGlobalIndex = Math.floor(currentTime / bucketSize) - offset;
        const bucketStartTime = bucketGlobalIndex * bucketSize;

        if(bucketStartTime < windowSize) {
            data.counts[i] = 0;
        }
    }
    //Count requests in the window
    buckets.counts[currentBucketIndex] += 1;

    const totalRequests = buckets.counts.reduce((sum, count) => sum + count, 0);

    return totalRequests <= maxRequests;

}

//Token Bucket Rate Limiter Middleware