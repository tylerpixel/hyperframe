import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

// Example usage:
// await redis.set('key', 'value')
// const value = await redis.get('key')
