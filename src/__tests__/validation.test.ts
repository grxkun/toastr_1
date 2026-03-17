import {
  validateTokenName,
  validateTicker,
  validateSuiObjectId,
  validateSuiAddress,
  validateXHandle,
  validateSuiAmount,
  parseLaunchCommand,
  parseDelegateCommand,
  parseRegisterCommand,
} from '../utils/validation';

// ──────────────────────────────────────────────────────────────
// validateTokenName
// ──────────────────────────────────────────────────────────────
describe('validateTokenName', () => {
  it('accepts valid names', () => {
    expect(validateTokenName('Moon Bread')).toBe(true);
    expect(validateTokenName('CryptoToken')).toBe(true);
    expect(validateTokenName('A')).toBe(true);
    expect(validateTokenName('Valid-Name_1')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(validateTokenName('')).toBe(false);
  });

  it('rejects names with special chars', () => {
    expect(validateTokenName('Bad<Script>')).toBe(false);
    expect(validateTokenName('DROP TABLE;')).toBe(false);
    expect(validateTokenName('name"with"quotes')).toBe(false);
  });

  it('rejects names exceeding 32 chars', () => {
    expect(validateTokenName('A'.repeat(33))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// validateTicker
// ──────────────────────────────────────────────────────────────
describe('validateTicker', () => {
  it('accepts valid tickers', () => {
    expect(validateTicker('BREAD')).toBe(true);
    expect(validateTicker('SUI')).toBe(true);
    expect(validateTicker('TKN1')).toBe(true);
  });

  it('rejects tickers with special chars', () => {
    expect(validateTicker('SUI!')).toBe(false);
    expect(validateTicker('BR-EAD')).toBe(false);
  });

  it('rejects empty tickers', () => {
    expect(validateTicker('')).toBe(false);
  });

  it('rejects tickers exceeding 10 chars', () => {
    expect(validateTicker('A'.repeat(11))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// validateSuiObjectId
// ──────────────────────────────────────────────────────────────
describe('validateSuiObjectId', () => {
  it('accepts valid object IDs', () => {
    expect(
      validateSuiObjectId(
        '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      ),
    ).toBe(true);
    expect(validateSuiObjectId('0x1')).toBe(true);
  });

  it('rejects object IDs without 0x prefix', () => {
    expect(validateSuiObjectId('abc123')).toBe(false);
  });

  it('rejects object IDs with non-hex chars', () => {
    expect(validateSuiObjectId('0xGGGG')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// validateSuiAddress
// ──────────────────────────────────────────────────────────────
describe('validateSuiAddress', () => {
  const validAddr =
    '0x' + 'a'.repeat(64);

  it('accepts a valid 64-char hex address', () => {
    expect(validateSuiAddress(validAddr)).toBe(true);
  });

  it('rejects address that is too short', () => {
    expect(validateSuiAddress('0x' + 'a'.repeat(63))).toBe(false);
  });

  it('rejects address that is too long', () => {
    expect(validateSuiAddress('0x' + 'a'.repeat(65))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// validateXHandle
// ──────────────────────────────────────────────────────────────
describe('validateXHandle', () => {
  it('accepts valid handles', () => {
    expect(validateXHandle('user123')).toBe(true);
    expect(validateXHandle('Toaster_Bot')).toBe(true);
  });

  it('rejects handles with @ prefix', () => {
    expect(validateXHandle('@user')).toBe(false);
  });

  it('rejects handles exceeding 15 chars', () => {
    expect(validateXHandle('A'.repeat(16))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// validateSuiAmount
// ──────────────────────────────────────────────────────────────
describe('validateSuiAmount', () => {
  it('accepts valid amounts', () => {
    expect(validateSuiAmount('1')).toBe(true);
    expect(validateSuiAmount('0.5')).toBe(true);
    expect(validateSuiAmount('100')).toBe(true);
  });

  it('rejects zero or negative amounts', () => {
    expect(validateSuiAmount('0')).toBe(false);
    expect(validateSuiAmount('-1')).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(validateSuiAmount('abc')).toBe(false);
    expect(validateSuiAmount('')).toBe(false);
  });

  it('rejects amounts over 1,000,000', () => {
    expect(validateSuiAmount('1000001')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// parseLaunchCommand
// ──────────────────────────────────────────────────────────────
describe('parseLaunchCommand', () => {
  it('parses a basic launch command', () => {
    const result = parseLaunchCommand('@Toaster launch "Moon Bread" BREAD');
    expect(result).not.toBeNull();
    expect(result?.tokenName).toBe('Moon Bread');
    expect(result?.ticker).toBe('BREAD');
    expect(result?.buyAmountSui).toBeUndefined();
  });

  it('parses a launch command with buy amount', () => {
    const result = parseLaunchCommand(
      '@Toaster launch CryptoToast TOAST buy: 2.5 SUI',
    );
    expect(result).not.toBeNull();
    expect(result?.tokenName).toBe('CryptoToast');
    expect(result?.ticker).toBe('TOAST');
    expect(result?.buyAmountSui).toBeCloseTo(2.5);
  });

  it('returns null for malformed command', () => {
    expect(parseLaunchCommand('@Toaster hello world')).toBeNull();
    expect(parseLaunchCommand('launch')).toBeNull();
  });

  it('rejects token names with injection chars', () => {
    const result = parseLaunchCommand(
      '@Toaster launch Bad<Script> TOKEN',
    );
    expect(result).toBeNull();
  });

  it('is case-insensitive for command keyword', () => {
    const result = parseLaunchCommand('@Toaster LAUNCH MyToken MTK');
    expect(result).not.toBeNull();
    expect(result?.ticker).toBe('MTK');
  });
});

// ──────────────────────────────────────────────────────────────
// parseDelegateCommand
// ──────────────────────────────────────────────────────────────
describe('parseDelegateCommand', () => {
  const validId = '0x' + 'a'.repeat(64);

  it('parses a valid delegate command with just object ID', () => {
    const result = parseDelegateCommand(`@Toaster delegate ${validId}`);
    expect(result).not.toBeNull();
    expect(result?.creatorCapId).toBe(validId);
    expect(result?.tokenName).toBeUndefined();
    expect(result?.tokenTicker).toBeUndefined();
  });

  it('parses delegate command with quoted token name and ticker', () => {
    const result = parseDelegateCommand(
      `@Toaster delegate ${validId} "Moon Bread" BREAD`,
    );
    expect(result).not.toBeNull();
    expect(result?.creatorCapId).toBe(validId);
    expect(result?.tokenName).toBe('Moon Bread');
    expect(result?.tokenTicker).toBe('BREAD');
  });

  it('parses delegate command with single-word name and ticker', () => {
    const result = parseDelegateCommand(
      `@Toaster delegate ${validId} MoonBread BREAD`,
    );
    expect(result).not.toBeNull();
    expect(result?.tokenTicker).toBe('BREAD');
  });

  it('returns null for missing object ID', () => {
    expect(parseDelegateCommand('@Toaster delegate')).toBeNull();
  });

  it('rejects non-hex object IDs', () => {
    expect(parseDelegateCommand('@Toaster delegate 0xGGGGGG')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// parseRegisterCommand
// ──────────────────────────────────────────────────────────────
describe('parseRegisterCommand', () => {
  const validAddr = '0x' + 'b'.repeat(64);

  it('parses a valid register command', () => {
    const result = parseRegisterCommand(`@Toaster register ${validAddr}`);
    expect(result).not.toBeNull();
    expect(result?.suiAddress).toBe(validAddr);
  });

  it('returns null for invalid address', () => {
    expect(parseRegisterCommand('@Toaster register 0xshort')).toBeNull();
  });
});
