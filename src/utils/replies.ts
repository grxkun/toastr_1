/**
 * Witty, bread-themed reply generator for Toaster.
 */

// ──────────────────────────────────────────────────────────────
// Success replies
// ──────────────────────────────────────────────────────────────

export function launchSuccessReply(
  tokenName: string,
  ticker: string,
  txLink: string,
): string {
  return (
    `🍞 Toasted to perfection! Your token $${ticker} ("${tokenName}") is ` +
    `fresh out of the oven.\n` +
    `✅ Tx: ${txLink}\n` +
    `Slicing the supply... crumbs incoming! 🔪`
  );
}

export function buyFirstReply(
  ticker: string,
  amountSui: number,
  txLink: string,
): string {
  return (
    `🧈 Buttered up! Snagged ${amountSui} SUI of $${ticker} in the same ` +
    `transaction block. That's the toast that spreads the fastest!\n` +
    `✅ Tx: ${txLink}`
  );
}

export function delegateSuccessReply(
  tokenName: string,
  ticker: string,
): string {
  return (
    `🍞 Delegation received! I'll manage $${ticker} ("${tokenName}") with ` +
    `the care of a master baker.\n` +
    `Auto-claiming fees, staking rewards, and sweeping crumbs to your wallet ` +
    `every 24 hours. You just sit back and let the dough rise! 🌾`
  );
}

export function registerSuccessReply(suiAddress: string): string {
  const short = `${suiAddress.slice(0, 6)}...${suiAddress.slice(-4)}`;
  return (
    `🍞 Wallet linked! Your Sui address (${short}) is now tied to your X handle.\n` +
    `You're ready to toast tokens. Fire away! 🔥`
  );
}

// ──────────────────────────────────────────────────────────────
// Rate-limit / guard replies
// ──────────────────────────────────────────────────────────────

export function rateLimitReply(hoursRemaining: number): string {
  return (
    `⏳ Whoa there, bread enthusiast! You already used your free launch today.\n` +
    `The toaster needs to cool down for another ` +
    `${Math.ceil(hoursRemaining)} hour(s) before the next pop. Come back soon! 🥖`
  );
}

// ──────────────────────────────────────────────────────────────
// Error replies
// ──────────────────────────────────────────────────────────────

export function unknownUserReply(): string {
  return (
    `🍞 I don't have your Sui wallet on file yet!\n` +
    `Register first with: @Toaster register <your-sui-address>`
  );
}

export function invalidCommandReply(): string {
  return (
    `🤔 Hmm, I couldn't quite parse that loaf of a command.\n` +
    `Try:\n` +
    `• @Toaster launch "Token Name" TICKER\n` +
    `• @Toaster launch "Token Name" TICKER buy: 1 SUI\n` +
    `• @Toaster delegate <CreatorCap_Object_ID>\n` +
    `• @Toaster register <sui-address>`
  );
}

export function txErrorReply(action: string, errorMsg: string): string {
  return (
    `🔥 Oops — the ${action} got a bit burnt!\n` +
    `Error: ${errorMsg}\n` +
    `I'll try again or reach out for help. Don't worry, no crumbs were wasted! 🍞`
  );
}

export function lowTreasuryAlert(balanceSui: number): string {
  return (
    `⚠️ TREASURY ALERT: Toaster's gas wallet is running low!\n` +
    `Current balance: ${balanceSui.toFixed(4)} SUI (threshold: 5 SUI).\n` +
    `Please top up the treasury wallet to keep the toaster hot! 🔌`
  );
}

export function claimReply(ticker: string, amountSui: number): string {
  return (
    `💰 Crumbs collected! Claimed ${amountSui.toFixed(4)} SUI in creator fees ` +
    `for $${ticker} and tossed them straight into the staking pool. 🌾`
  );
}

export function rewardSweepReply(
  ticker: string,
  amountSui: number,
  recipientShort: string,
): string {
  return (
    `🎉 Staking rewards ready! Swept ${amountSui.toFixed(4)} SUI from $${ticker} ` +
    `staking to your wallet (${recipientShort}). Fresh bread delivered! 🍞`
  );
}
