import { redis } from "./redis-config.js";
import { v4 as uuidv4 } from "uuid";

// Function to generate a unique subdomain
export async function createSession() {
  const subdomain = uuidv4(); // Generate a unique identifier
  const sessionKey = `session:${subdomain}`;

  // Store the session in Redis with a 1-hour expiration
  await redis.set(sessionKey, "active", { ex: 3600 });

  return subdomain;
}

// Function to check if a session is valid
export async function isSessionValid(subdomain) {
  const sessionKey = `session:${subdomain}`;
  const sessionStatus = await redis.get(sessionKey);
  return sessionStatus === "active";
}
