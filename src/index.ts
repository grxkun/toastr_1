import 'dotenv/config';
import { startStream } from './twitter/stream';
import { cronManager } from './cron/manager';
import prisma from './db/client';

async function main(): Promise<void> {
  console.log('🍞 Toaster is warming up…');

  // Verify DB connection
  try {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL via Prisma.');
  } catch (err) {
    console.error('[DB] Failed to connect to database:', err);
    process.exit(1);
  }

  // Start the cron manager
  cronManager.start();
  console.log('[Cron] Background delegation cycle started.');

  // Start the Twitter stream
  try {
    await startStream();
  } catch (err) {
    console.error('[Stream] Failed to start Twitter stream:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('\n🍞 Toaster cooling down…');
    cronManager.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
