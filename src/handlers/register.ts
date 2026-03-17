import prisma from '../db/client';
import { parseRegisterCommand } from '../utils/validation';
import { invalidCommandReply } from '../utils/replies';

// ──────────────────────────────────────────────────────────────
// Register handler
// ──────────────────────────────────────────────────────────────

/**
 * Handle @Toaster register <suiAddress>
 * Links an X handle to a Sui wallet address.
 */
export async function handleRegister(
  xHandle: string,
  tweetText: string,
): Promise<string> {
  const cmd = parseRegisterCommand(tweetText);
  if (!cmd) return invalidCommandReply();

  await prisma.user.upsert({
    where: { xHandle },
    create: { xHandle, suiAddress: cmd.suiAddress },
    update: { suiAddress: cmd.suiAddress },
  });

  const short = `${cmd.suiAddress.slice(0, 6)}...${cmd.suiAddress.slice(-4)}`;
  return (
    `🍞 Wallet linked! Your Sui address (${short}) is now tied to @${xHandle}.\n` +
    `Ready to toast tokens. Fire away! 🔥`
  );
}
