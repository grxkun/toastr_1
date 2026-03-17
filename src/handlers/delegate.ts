import prisma from '../db/client';
import { parseDelegateCommand } from '../utils/validation';
import {
  unknownUserReply,
  delegateSuccessReply,
  invalidCommandReply,
} from '../utils/replies';

// ──────────────────────────────────────────────────────────────
// Delegate handler
// ──────────────────────────────────────────────────────────────

/**
 * Handle @Toaster delegate [CreatorCap_ID] ["Token Name"] [TICKER]
 *
 * Stores the delegation in the DB so the cron manager can
 * auto-claim fees, auto-stake, and auto-sweep rewards.
 *
 * NOTE: The user must have already transferred the CreatorCap object
 * to Toaster's treasury wallet on-chain before calling this command.
 */
export async function handleDelegate(
  xHandle: string,
  tweetText: string,
): Promise<string> {
  // 1. Parse command
  const cmd = parseDelegateCommand(tweetText);
  if (!cmd) return invalidCommandReply();

  // 2. Verify user exists
  const user = await prisma.user.findUnique({ where: { xHandle } });
  if (!user) return unknownUserReply();

  const tokenName = cmd.tokenName ?? 'Unknown';
  const tokenTicker = cmd.tokenTicker ?? 'UNK';

  // 3. Store delegation (upsert to avoid duplicates)
  await prisma.delegation.upsert({
    where: { creatorCapId: cmd.creatorCapId },
    create: {
      userId: user.id,
      creatorCapId: cmd.creatorCapId,
      tokenName,
      tokenTicker,
      isActive: true,
    },
    update: {
      isActive: true,
      ...(cmd.tokenName ? { tokenName: cmd.tokenName } : {}),
      ...(cmd.tokenTicker ? { tokenTicker: cmd.tokenTicker } : {}),
      updatedAt: new Date(),
    },
  });

  return delegateSuccessReply(tokenName, tokenTicker);
}
