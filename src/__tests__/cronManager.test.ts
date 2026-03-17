import { CronManager } from '../cron/manager';

// Mock the Sui transaction functions and Prisma to avoid real network calls
jest.mock('../sui/transactions', () => ({
  claimCreatorFee: jest.fn().mockResolvedValue({ digest: 'abc', claimedMist: BigInt(500_000_000) }),
  stakeFees: jest.fn().mockResolvedValue({ digest: 'def', stakingObjectId: '0xstake1' }),
  claimAndSweepRewards: jest.fn().mockResolvedValue({ digest: 'ghi', rewardMist: BigInt(100_000_000) }),
  getTreasuryBalanceSui: jest.fn().mockResolvedValue(10),
}));

jest.mock('../db/client', () => ({
  __esModule: true,
  default: {
    delegation: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          creatorCapId: '0x' + 'c'.repeat(64),
          stakingObjectId: null,
          tokenTicker: 'BREAD',
          user: {
            suiAddress: '0x' + 'a'.repeat(64),
            xHandle: 'breadlover',
          },
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ stakingObjectId: '0xstake1' }),
    },
  },
}));

describe('CronManager', () => {
  it('can be instantiated', () => {
    const manager = new CronManager();
    expect(manager).toBeDefined();
  });

  it('start and stop do not throw', () => {
    const manager = new CronManager();
    expect(() => manager.start()).not.toThrow();
    expect(() => manager.stop()).not.toThrow();
  });

  it('runCycle processes active delegations without throwing', async () => {
    const manager = new CronManager();
    const notifications: string[] = [];
    await expect(
      manager.runCycle(async (msg) => {
        notifications.push(msg);
      }),
    ).resolves.not.toThrow();
  });
});
