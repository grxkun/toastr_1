import prisma from '../db/client';
import { launchToken, getTreasuryBalanceSui } from '../sui/transactions';
import { parseLaunchCommand } from '../utils/validation';
import {
  launchSuccessReply,
  unknownUserReply,
  rateLimitReply,
  invalidCommandReply,
  txErrorReply,
  lowTreasuryAlert,
} from '../utils/replies';

const FREE_LAUNCH_COOLDOWN_MS =
  Number(process.env.FREE_LAUNCH_COOLDOWN_HOURS ?? '24') * 60 * 60 * 1000;

const TREASURY_LOW_THRESHOLD =
  Number(process.env.TREASURY_LOW_BALANCE_THRESHOLD_SUI ?? '5');

// ──────────────────────────────────────────────────────────────
// Launch handler
// ──────────────────────────────────────────────────────────────

/**
 * Handle @Toaster launch [Name] [Ticker] (buy: [amount] SUI)?
 */
export async function handleLaunch(
  xHandle: string,
  tweetText: string,
  replyFn: (msg: string) => Promise<void>,
): Promise<string> {
  // 1. Parse the command
  const cmd = parseLaunchCommand(tweetText);
  if (!cmd) return invalidCommandReply();

  // 2. Look up the user in the DB
  const user = await prisma.user.findUnique({ where: { xHandle } });
  if (!user) return unknownUserReply();

  // 3. Rate-limit: one free launch per 24 hours
  if (user.lastFreeLaunchAt) {
    const elapsed = Date.now() - user.lastFreeLaunchAt.getTime();
    if (elapsed < FREE_LAUNCH_COOLDOWN_MS) {
      const remainingMs = FREE_LAUNCH_COOLDOWN_MS - elapsed;
      const remainingHours = remainingMs / (1000 * 60 * 60);
      return rateLimitReply(remainingHours);
    }
  }

  // 4. Check treasury balance
  const balance = await getTreasuryBalanceSui();
  if (balance < TREASURY_LOW_THRESHOLD) {
    // Alert but still attempt (operator should top-up)
    await replyFn(lowTreasuryAlert(balance));
  }

  // 5. Execute on-chain launch
  try {
    const result = await launchToken({
      tokenName: cmd.tokenName,
      ticker: cmd.ticker,
      creatorSuiAddress: user.suiAddress,
      buyAmountSui: cmd.buyAmountSui,
    });

    // 6. Update rate-limit timestamp
    await prisma.user.update({
      where: { xHandle },
      data: { lastFreeLaunchAt: new Date() },
    });

    return launchSuccessReply(cmd.tokenName, cmd.ticker, result.txLink);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return txErrorReply('launch', msg);
  }
}
