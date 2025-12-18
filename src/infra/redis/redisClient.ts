import { createClient } from "redis";
import { redisConfig } from "../../config/redis.config";

const redisClient = createClient({
    url: redisConfig.url,
    socket: {
        reconnectStrategy: (retries: number) => {
            if(retries > 10) {
                console.error("Redis reconnect failed after 10 attempts");
                return new Error('Max retries reached, giving up reconnecting to Redis');
            }

            const delay = Math.min(retries * 100, 3000);
            console.warn(`Redis reconnect attempt ${retries}, retrying in ${delay}ms`);

            return delay;
        }
    }
})

redisClient.on('error', (err: Error) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('reconnecting', () => console.log('Reconnecting to Redis'));
redisClient.on('ready', () => console.log('Redis Client Ready'));
redisClient.on('end', () => console.log('Disconnected from Redis'));

export const connectRedis = async () => {
    if(!redisClient.isOpen){
        await redisClient.connect();
    }
}

process.on("SIGINT", async () => {
  console.log("Shutting down Redis...");
  await redisClient.quit();
  process.exit(0);
});

export default redisClient;
