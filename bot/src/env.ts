import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load bot/.env.local first, falling back to bot/.env
const botDir = path.resolve(process.cwd(), 'bot');
dotenv.config({ path: path.resolve(botDir, '.env.local') });
dotenv.config({ path: path.resolve(botDir, '.env') });
// Also allow loading from root if running directly inside bot directory
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const botEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APPLICATION_ID: z.string().min(1, 'DISCORD_APPLICATION_ID is required'),
  DISCORD_PUBLIC_KEY: z.string().optional().default(''),
  DISCORD_DEV_GUILD_ID: z.string().optional().default(''),
  DISCORD_LINK_PEPPER: z.string().min(1, 'DISCORD_LINK_PEPPER is required'),
  APP_URL: z.string().default('http://localhost:3000'),
  DISCORD_BOT_PUBLIC_NAME: z.string().default('ZedArchive'),
});

const parsed = botEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid bot environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const botEnv = parsed.data;
