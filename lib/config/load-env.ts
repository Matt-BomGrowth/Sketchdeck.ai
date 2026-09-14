/**
 * Environment loader for CLI scripts and jobs run outside Next.js.
 *
 * Mirrors Next.js precedence: `.env.local` (local secrets, git-ignored) wins
 * over `.env` (shared, non-secret defaults). Inside Next.js (`next dev|build|
 * start`) these files are loaded by the framework itself, so this module is a
 * no-op there. Variables already present in the process environment (e.g. set
 * by Vercel or the shell) are never overridden.
 */
import { config } from "dotenv";

if (!process.env.__NEXT_PROCESSED_ENV) {
  config({ path: [".env.local", ".env"], quiet: true });
}
