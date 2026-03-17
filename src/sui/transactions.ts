import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiTransactionBlockResponse,
} from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

// ──────────────────────────────────────────────────────────────
// Client setup
// ──────────────────────────────────────────────────────────────

function buildSuiClient(): SuiJsonRpcClient {
  const network =
    (process.env.SUI_NETWORK as 'mainnet' | 'testnet' | 'devnet') ?? 'mainnet';
  const rpcUrl =
    process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(network);
  return new SuiJsonRpcClient({ url: rpcUrl, network });
}

export const suiClient: SuiJsonRpcClient = buildSuiClient();

/**
 * Load the treasury keypair from the environment.
 * Expects SUI_PRIVATE_KEY as a bech32 suiprivkey1… or raw base64 string.
 */
export function getTreasuryKeypair(): Ed25519Keypair {
  const raw = process.env.SUI_PRIVATE_KEY;
  if (!raw) throw new Error('SUI_PRIVATE_KEY is not set');

  // Support both bech32 (suiprivkey1…) and raw base64
  if (raw.startsWith('suiprivkey')) {
    return Ed25519Keypair.fromSecretKey(raw);
  }
  // Fallback: treat as raw base64 (32 bytes or 64 bytes with flag)
  const bytes = fromBase64(raw);
  // If 33 bytes, strip the first flag byte (0x00 for Ed25519)
  const key = bytes.length === 33 ? bytes.slice(1) : bytes;
  return Ed25519Keypair.fromSecretKey(key);
}

// ──────────────────────────────────────────────────────────────
// Treasury balance
// ──────────────────────────────────────────────────────────────

const MIST_PER_SUI = 1_000_000_000n;

/**
 * Returns the treasury wallet's SUI balance in MIST.
 */
export async function getTreasuryBalanceMist(): Promise<bigint> {
  const keypair = getTreasuryKeypair();
  const address = keypair.getPublicKey().toSuiAddress();
  const result = await suiClient.getBalance({ owner: address });
  return BigInt(result.totalBalance);
}

/**
 * Returns the treasury wallet's SUI balance as a human-readable number.
 */
export async function getTreasuryBalanceSui(): Promise<number> {
  const mist = await getTreasuryBalanceMist();
  return Number(mist) / Number(MIST_PER_SUI);
}

// ──────────────────────────────────────────────────────────────
// Gas estimation helper
// ──────────────────────────────────────────────────────────────

/** Default gas budget: 0.1 SUI – covers most PTB operations. */
const GAS_BUDGET_DEFAULT = 100_000_000n; // 0.1 SUI

/**
 * Estimates the gas budget for a transaction by doing a dry-run on chain.
 * Falls back to the default budget if dry-run fails.
 */
async function estimateGasBudget(tx: Transaction): Promise<bigint> {
  try {
    const keypair = getTreasuryKeypair();
    const sender = keypair.getPublicKey().toSuiAddress();
    tx.setSender(sender);
    const builtTx = await tx.build();
    const dryRun = await suiClient.dryRunTransactionBlock({
      transactionBlock: builtTx,
    });
    if (dryRun.effects.gasUsed) {
      const { computationCost, storageCost, storageRebate } =
        dryRun.effects.gasUsed;
      const estimated =
        BigInt(computationCost) +
        BigInt(storageCost) -
        BigInt(storageRebate);
      // Add 20% buffer
      return (estimated * 120n) / 100n;
    }
  } catch {
    // Fall through to default budget on estimation failure
  }
  return GAS_BUDGET_DEFAULT;
}

// ──────────────────────────────────────────────────────────────
// Moonbags helpers
// ──────────────────────────────────────────────────────────────

function getMoonbagsPackageId(): string {
  const pkg = process.env.MOONBAGS_PACKAGE_ID;
  if (!pkg) throw new Error('MOONBAGS_PACKAGE_ID is not set');
  return pkg;
}

/** Convert SUI float to MIST bigint */
function suiToMist(sui: number): bigint {
  return BigInt(Math.round(sui * Number(MIST_PER_SUI)));
}

/** Apply 1% slippage protection: reduce expected amount by 1% */
function applySlippage(mistAmount: bigint): bigint {
  return (mistAmount * 99n) / 100n;
}

// ──────────────────────────────────────────────────────────────
// PTB: Launch token (+ optional buy-first)
// ──────────────────────────────────────────────────────────────

export interface LaunchTokenOptions {
  tokenName: string;
  ticker: string;
  creatorSuiAddress: string;
  buyAmountSui?: number;
}

export interface LaunchTokenResult {
  digest: string;
  txLink: string;
  creatorCapId?: string;
}

/**
 * Build and execute a PTB that:
 * 1. Calls factory::create_token (Toaster pays the 1 SUI subsidy)
 * 2. Optionally calls factory::buy_first with the requested SUI amount
 * 3. Transfers the resulting CreatorCap to the user's wallet
 */
export async function launchToken(
  opts: LaunchTokenOptions,
): Promise<LaunchTokenResult> {
  const keypair = getTreasuryKeypair();
  const packageId = getMoonbagsPackageId();
  const factory = process.env.MOONBAGS_FACTORY_MODULE ?? 'factory';

  const tx = new Transaction();

  // Step 1: Split the 1 SUI subsidy from the gas coin
  const subsidyMist = BigInt(
    process.env.LAUNCH_SUBSIDY_MIST ?? '1000000000',
  );
  const [subsidyCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(subsidyMist)]);

  // Step 2: Call factory::create_token
  // Expected signature (example):
  //   public fun create_token(
  //     name: vector<u8>, ticker: vector<u8>, payment: Coin<SUI>, ctx: &mut TxContext
  //   ): CreatorCap
  const [creatorCap] = tx.moveCall({
    target: `${packageId}::${factory}::create_token`,
    arguments: [
      tx.pure.string(opts.tokenName),
      tx.pure.string(opts.ticker),
      subsidyCoin,
    ],
  });

  // Step 3: Optional buy-first
  if (opts.buyAmountSui !== undefined && opts.buyAmountSui > 0) {
    const buyMist = suiToMist(opts.buyAmountSui);
    const minOut = applySlippage(buyMist); // 1% slippage guard
    const [buyCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(buyMist)]);

    tx.moveCall({
      target: `${packageId}::${factory}::buy_first`,
      arguments: [
        creatorCap,
        buyCoin,
        tx.pure.u64(minOut),
      ],
    });
  }

  // Step 4: Transfer the CreatorCap to the original creator
  tx.transferObjects([creatorCap], tx.pure.address(opts.creatorSuiAddress));

  // Step 5: Set gas budget
  const gasBudget = await estimateGasBudget(tx);
  tx.setGasBudget(gasBudget);

  const result: SuiTransactionBlockResponse = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showObjectChanges: true,
      showEffects: true,
    },
  });

  const txLink = buildTxLink(result.digest);
  return { digest: result.digest, txLink };
}

// ──────────────────────────────────────────────────────────────
// PTB: Claim creator fee
// ──────────────────────────────────────────────────────────────

export interface ClaimFeeResult {
  digest: string;
  claimedMist: bigint;
}

/**
 * Call factory::claim_creator_fee using the stored CreatorCap.
 */
export async function claimCreatorFee(
  creatorCapId: string,
): Promise<ClaimFeeResult> {
  const keypair = getTreasuryKeypair();
  const packageId = getMoonbagsPackageId();
  const factory = process.env.MOONBAGS_FACTORY_MODULE ?? 'factory';

  const tx = new Transaction();

  // claim_creator_fee(cap: &mut CreatorCap, ctx: &mut TxContext): Coin<SUI>
  const [feeCoin] = tx.moveCall({
    target: `${packageId}::${factory}::claim_creator_fee`,
    arguments: [tx.object(creatorCapId)],
  });

  // Keep the coin in the treasury (will be staked separately)
  tx.transferObjects([feeCoin], tx.pure.address(keypair.getPublicKey().toSuiAddress()));

  tx.setGasBudget(await estimateGasBudget(tx));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showBalanceChanges: true, showEffects: true },
  });

  // Extract the SUI balance change for reporting
  let claimedMist = 0n;
  if (result.balanceChanges) {
    const addr = keypair.getPublicKey().toSuiAddress();
    for (const change of result.balanceChanges) {
      const owner =
        typeof change.owner === 'object' && 'AddressOwner' in change.owner
          ? change.owner.AddressOwner
          : null;
      if (owner === addr && change.coinType === '0x2::sui::SUI') {
        const val = BigInt(change.amount);
        if (val > 0n) claimedMist += val;
      }
    }
  }

  return { digest: result.digest, claimedMist };
}

// ──────────────────────────────────────────────────────────────
// PTB: Stake claimed fees
// ──────────────────────────────────────────────────────────────

export interface StakeResult {
  digest: string;
  stakingObjectId?: string;
}

/**
 * Stake SUI into Moonbags staking pools using staking::stake.
 * @param amountMist  How many MIST to stake from the treasury wallet.
 * @param existingStakingObjectId  Pass the existing staking position ID to add to it,
 *                                 or undefined to create a new one.
 */
export async function stakeFees(
  amountMist: bigint,
  existingStakingObjectId?: string,
): Promise<StakeResult> {
  const keypair = getTreasuryKeypair();
  const packageId = getMoonbagsPackageId();
  const staking = process.env.MOONBAGS_STAKING_MODULE ?? 'staking';

  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  let stakingObjectRef;
  if (existingStakingObjectId) {
    // Add to existing staking position
    stakingObjectRef = tx.moveCall({
      target: `${packageId}::${staking}::add_stake`,
      arguments: [tx.object(existingStakingObjectId), stakeCoin],
    });
  } else {
    // Create a new staking position
    [stakingObjectRef] = tx.moveCall({
      target: `${packageId}::${staking}::stake`,
      arguments: [stakeCoin],
    });
    // Transfer the new staking object to treasury
    tx.transferObjects(
      [stakingObjectRef],
      tx.pure.address(keypair.getPublicKey().toSuiAddress()),
    );
  }

  tx.setGasBudget(await estimateGasBudget(tx));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  // Extract the new staking object ID if created
  let stakingObjectId: string | undefined;
  if (!existingStakingObjectId && result.objectChanges) {
    for (const change of result.objectChanges) {
      if (
        change.type === 'created' &&
        change.objectType.includes(`${staking}::`)
      ) {
        stakingObjectId = change.objectId;
        break;
      }
    }
  }

  return { digest: result.digest, stakingObjectId };
}

// ──────────────────────────────────────────────────────────────
// PTB: Claim staking rewards and sweep to user
// ──────────────────────────────────────────────────────────────

export interface RewardSweepResult {
  digest: string;
  rewardMist: bigint;
}

/**
 * Claims staking rewards and transfers them to the user's wallet.
 */
export async function claimAndSweepRewards(
  stakingObjectId: string,
  recipientAddress: string,
): Promise<RewardSweepResult> {
  const keypair = getTreasuryKeypair();
  const packageId = getMoonbagsPackageId();
  const staking = process.env.MOONBAGS_STAKING_MODULE ?? 'staking';

  const tx = new Transaction();

  const [rewardCoin] = tx.moveCall({
    target: `${packageId}::${staking}::claim_rewards`,
    arguments: [tx.object(stakingObjectId)],
  });

  tx.transferObjects([rewardCoin], tx.pure.address(recipientAddress));

  tx.setGasBudget(await estimateGasBudget(tx));

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showBalanceChanges: true, showEffects: true },
  });

  let rewardMist = 0n;
  if (result.balanceChanges) {
    for (const change of result.balanceChanges) {
      const owner =
        typeof change.owner === 'object' && 'AddressOwner' in change.owner
          ? change.owner.AddressOwner
          : null;
      if (owner === recipientAddress && change.coinType === '0x2::sui::SUI') {
        const val = BigInt(change.amount);
        if (val > 0n) rewardMist += val;
      }
    }
  }

  return { digest: result.digest, rewardMist };
}

// ──────────────────────────────────────────────────────────────
// Explorer link helper
// ──────────────────────────────────────────────────────────────

export function buildTxLink(digest: string): string {
  const network = process.env.SUI_NETWORK ?? 'mainnet';
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}
