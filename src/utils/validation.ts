/**
 * Validation utilities for Toaster command parsing.
 * Protects against injection attacks via X (Twitter) commands.
 */

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** Maximum allowed token name length */
export const MAX_TOKEN_NAME_LENGTH = 32;

/** Maximum allowed token ticker length */
export const MAX_TICKER_LENGTH = 10;

/** Regex: valid token name – letters, digits, spaces, hyphens only */
const TOKEN_NAME_RE = /^[A-Za-z0-9 _-]{1,32}$/;

/** Regex: valid ticker – uppercase/lowercase letters and digits only */
const TICKER_RE = /^[A-Za-z0-9]{1,10}$/;

/** Regex: valid Sui object ID (0x followed by 1–64 hex chars) */
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;

/** Regex: valid Sui address (0x followed by 64 hex chars) */
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

/** Regex: valid X handle (1–15 alphanumeric chars + underscore, no @) */
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

// ──────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────

/**
 * Validates a token name.
 * Only allows letters, digits, spaces, hyphens, and underscores.
 */
export function validateTokenName(name: string): boolean {
  return TOKEN_NAME_RE.test(name.trim());
}

/**
 * Validates a token ticker symbol.
 * Only allows alphanumeric characters, 1–10 chars.
 */
export function validateTicker(ticker: string): boolean {
  return TICKER_RE.test(ticker.trim());
}

/**
 * Validates a Sui object ID string.
 */
export function validateSuiObjectId(objectId: string): boolean {
  return SUI_OBJECT_ID_RE.test(objectId.trim());
}

/**
 * Validates a Sui wallet address string (full 32-byte / 64 hex char form).
 */
export function validateSuiAddress(address: string): boolean {
  return SUI_ADDRESS_RE.test(address.trim());
}

/**
 * Validates an X (Twitter) handle (without the leading @).
 */
export function validateXHandle(handle: string): boolean {
  return X_HANDLE_RE.test(handle.trim());
}

/**
 * Validates a positive SUI amount string (e.g., "0.5", "10").
 * Must be a positive finite number ≤ 1,000,000.
 */
export function validateSuiAmount(amount: string): boolean {
  const value = parseFloat(amount);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000;
}

// ──────────────────────────────────────────────────────────────
// Parsed command types
// ──────────────────────────────────────────────────────────────

export interface LaunchCommand {
  tokenName: string;
  ticker: string;
  buyAmountSui?: number;
}

/**
 * Parse: @Toaster delegate [CreatorCap_ID] [TokenName] [TICKER]
 *
 * The token name and ticker are optional but recommended.
 * Multi-word names must be quoted: @Toaster delegate 0x... "Moon Bread" BREAD
 */
export interface DelegateCommand {
  creatorCapId: string;
  tokenName?: string;
  tokenTicker?: string;
}

export interface RegisterCommand {
  suiAddress: string;
}

// ──────────────────────────────────────────────────────────────
// Command parsers
// ──────────────────────────────────────────────────────────────

/**
 * Parse: @Toaster launch [Name] [Ticker] (buy: [amount] SUI)?
 *
 * Returns a LaunchCommand or null if the tweet does not match.
 *
 * Token name rules:
 *  - Multi-word names must be wrapped in double quotes: "Moon Bread"
 *  - Single-word names may be unquoted: MoonBread
 */
export function parseLaunchCommand(text: string): LaunchCommand | null {
  // Strip leading/trailing whitespace and collapse internal whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Match quoted name:   launch "Token Name" TICKER (buy: X SUI)?
  // OR single-word name: launch TokenName TICKER (buy: X SUI)?
  const quotedRe =
    /launch\s+"([A-Za-z0-9 _-]{1,32})"\s+([A-Za-z0-9]{1,10})(?:\s+buy:\s*([\d.]+)\s*SUI)?/i;
  const unquotedRe =
    /launch\s+([A-Za-z0-9_-]{1,32})\s+([A-Za-z0-9]{1,10})(?:\s+buy:\s*([\d.]+)\s*SUI)?/i;

  let match = quotedRe.exec(normalized) ?? unquotedRe.exec(normalized);
  if (!match) return null;

  const tokenName = match[1].trim();
  const ticker = match[2].trim().toUpperCase();
  const buyAmountStr = match[3];

  if (!validateTokenName(tokenName) || !validateTicker(ticker)) return null;

  const command: LaunchCommand = { tokenName, ticker };

  if (buyAmountStr !== undefined) {
    if (!validateSuiAmount(buyAmountStr)) return null;
    command.buyAmountSui = parseFloat(buyAmountStr);
  }

  return command;
}

/**
 * Parse: @Toaster delegate [CreatorCap_ID] ["Token Name"|TokenName] [TICKER]
 *
 * Returns a DelegateCommand or null if the tweet does not match.
 * Token name and ticker are optional but recommended for better tracking.
 */
export function parseDelegateCommand(text: string): DelegateCommand | null {
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Base: extract object ID
  const idRe = /delegate\s+(0x[0-9a-fA-F]{1,64})/i;
  const idMatch = idRe.exec(normalized);
  if (!idMatch) return null;

  const creatorCapId = idMatch[1].trim();
  if (!validateSuiObjectId(creatorCapId)) return null;

  // Optional: extract quoted multi-word name + ticker
  // e.g.: delegate 0x... "Moon Bread" BREAD
  const quotedNameRe =
    /delegate\s+0x[0-9a-fA-F]{1,64}\s+"([A-Za-z0-9 _-]{1,32})"\s+([A-Za-z0-9]{1,10})/i;
  const quotedMatch = quotedNameRe.exec(normalized);
  if (quotedMatch) {
    return {
      creatorCapId,
      tokenName: quotedMatch[1].trim(),
      tokenTicker: quotedMatch[2].trim().toUpperCase(),
    };
  }

  // Optional: extract single-word name + ticker
  // e.g.: delegate 0x... MoonBread BREAD
  const unquotedNameRe =
    /delegate\s+0x[0-9a-fA-F]{1,64}\s+([A-Za-z0-9_-]{1,32})\s+([A-Za-z0-9]{1,10})/i;
  const unquotedMatch = unquotedNameRe.exec(normalized);
  if (unquotedMatch) {
    return {
      creatorCapId,
      tokenName: unquotedMatch[1].trim(),
      tokenTicker: unquotedMatch[2].trim().toUpperCase(),
    };
  }

  // No name/ticker provided
  return { creatorCapId };
}

/**
 * Parse: @Toaster register [SuiAddress]
 *
 * Returns a RegisterCommand or null if the tweet does not match.
 */
export function parseRegisterCommand(text: string): RegisterCommand | null {
  const normalized = text.replace(/\s+/g, ' ').trim();

  const re = /register\s+(0x[0-9a-fA-F]{64})/i;
  const match = re.exec(normalized);
  if (!match) return null;

  const suiAddress = match[1].trim();
  if (!validateSuiAddress(suiAddress)) return null;

  return { suiAddress };
}
