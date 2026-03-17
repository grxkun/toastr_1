import cron from 'node-cron';
import prisma from '../db/client';
import {
  claimCreatorFee,
  stakeFees,
  claimAndSweepRewards,
  getTreasuryBalanceSui,
} from '../sui/transactions';
import {
  lowTreasuryAlert,
  claimReply,
  rewardSweepReply,
} from '../utils/replies';

const MIST_PER_SUI = 1_000_000_000;
const TREASURY_LOW_THRESHOLD = Number(
  process.env.TREASURY_LOW_BALANCE_THRESHOLD_SUI ?? '5',
);

/**
 * The CronManager runs background tasks every CRON_INTERVAL_HOURS.
 * For each active delegation it:
 *   1. Claims creator fees from Moonbags
 *   2. Stakes the claimed fees into Moonbags staking pools
 *   3. Claims staking rewards and sweeps them to the owner's wallet
 */
export class CronManager {
  private job: ReturnType<typeof cron.schedule> | null = null;
  private readonly intervalHours: number;

  constructor() {
    this.intervalHours = Number(process.env.CRON_INTERVAL_HOURS ?? '24');
  }

  /**
   * Starts the cron job.
   */
  start(notifyFn?: (msg: string) => Promise<void>): void {
    // Build a cron expression for "every N hours"
    const expr = this.buildCronExpression(this.intervalHours);
    console.log(`[CronManager] Starting with schedule: ${expr}`);

    this.job = cron.schedule(expr, async () => {
      await this.runCycle(notifyFn);
    });
  }

  /**
   * Stops the cron job.
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[CronManager] Stopped.');
    }
  }

  /**
   * Runs one full delegation cycle immediately.
   * Useful for testing or manual triggers.
   */
  async runCycle(notifyFn?: (msg: string) => Promise<void>): Promise<void> {
    console.log('[CronManager] Starting delegation cycle…');

    // 1. Treasury health check
    try {
      const balance = await getTreasuryBalanceSui();
      if (balance < TREASURY_LOW_THRESHOLD) {
        const alert = lowTreasuryAlert(balance);
        console.warn('[CronManager]', alert);
        if (notifyFn) await notifyFn(alert);
      }
    } catch (err) {
      console.error('[CronManager] Failed to check treasury balance:', err);
    }

    // 2. Process each active delegation
    const delegations = await prisma.delegation.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    console.log(`[CronManager] Processing ${delegations.length} delegation(s)…`);

    for (const delegation of delegations) {
      try {
        await this.processDelegation(delegation, notifyFn);
      } catch (err) {
        console.error(
          `[CronManager] Error processing delegation ${delegation.id}:`,
          err,
        );
      }
    }

    console.log('[CronManager] Cycle complete.');
  }

  private async processDelegation(
    delegation: {
      id: number;
      creatorCapId: string;
      stakingObjectId: string | null;
      tokenTicker: string;
      user: { suiAddress: string; xHandle: string };
    },
    notifyFn?: (msg: string) => Promise<void>,
  ): Promise<void> {
    const { creatorCapId, stakingObjectId, tokenTicker, user } = delegation;

    // ── Step 1: Claim creator fees ────────────────────────────
    let claimedMist = 0n;
    try {
      const claimResult = await claimCreatorFee(creatorCapId);
      claimedMist = claimResult.claimedMist;
      console.log(
        `[CronManager] Claimed ${claimedMist} MIST for ${tokenTicker}`,
      );

      await prisma.delegation.update({
        where: { id: delegation.id },
        data: { lastClaimAt: new Date() },
      });
    } catch (err) {
      console.error(`[CronManager] Claim failed for ${tokenTicker}:`, err);
    }

    // ── Step 2: Stake claimed fees ────────────────────────────
    if (claimedMist > 0n) {
      try {
        const stakeResult = await stakeFees(
          claimedMist,
          stakingObjectId ?? undefined,
        );

        await prisma.delegation.update({
          where: { id: delegation.id },
          data: {
            lastStakeAt: new Date(),
            ...(stakeResult.stakingObjectId
              ? { stakingObjectId: stakeResult.stakingObjectId }
              : {}),
          },
        });

        const amountSui = Number(claimedMist) / MIST_PER_SUI;
        const reply = claimReply(tokenTicker, amountSui);
        console.log(`[CronManager] ${reply}`);
        if (notifyFn) await notifyFn(reply);
      } catch (err) {
        console.error(`[CronManager] Staking failed for ${tokenTicker}:`, err);
      }
    }

    // ── Step 3: Claim staking rewards and sweep to user ───────
    const currentStakingId =
      stakingObjectId ??
      (
        await prisma.delegation.findUnique({
          where: { id: delegation.id },
          select: { stakingObjectId: true },
        })
      )?.stakingObjectId;

    if (currentStakingId) {
      try {
        const sweepResult = await claimAndSweepRewards(
          currentStakingId,
          user.suiAddress,
        );

        await prisma.delegation.update({
          where: { id: delegation.id },
          data: { lastRewardAt: new Date() },
        });

        if (sweepResult.rewardMist > 0n) {
          const amountSui = Number(sweepResult.rewardMist) / MIST_PER_SUI;
          const short = `${user.suiAddress.slice(0, 6)}...${user.suiAddress.slice(-4)}`;
          const reply = rewardSweepReply(tokenTicker, amountSui, short);
          console.log(`[CronManager] ${reply}`);
          if (notifyFn) await notifyFn(reply);
        }
      } catch (err) {
        console.error(
          `[CronManager] Reward sweep failed for ${tokenTicker}:`,
          err,
        );
      }
    }
  }

  /**
   * Build a cron expression that fires every `hours` hours.
   * Falls back to every hour if hours ≤ 0 or > 23.
   */
  private buildCronExpression(hours: number): string {
    if (hours >= 1 && hours <= 23) {
      return `0 */${hours} * * *`;
    }
    if (hours === 24) {
      return '0 0 * * *'; // midnight every day
    }
    return '0 * * * *'; // fallback: every hour
  }
}

export const cronManager = new CronManager();
