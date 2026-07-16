import { LiveCoach } from "./live-coach.js";

/**
 * Singleton LiveCoach instance for the server.
 *
 * This lets multiple routes (e.g. kitchen + live-coach routes) push context into the
 * same underlying Gemini Live session.
 */
export const liveCoach = new LiveCoach();

