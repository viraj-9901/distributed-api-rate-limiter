import dotenv from "dotenv";
dotenv.config();

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not defined");
}

export const redisConfig = {
  url: process.env.REDIS_URL,
};
