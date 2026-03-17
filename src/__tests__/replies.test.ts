import {
  launchSuccessReply,
  buyFirstReply,
  delegateSuccessReply,
  registerSuccessReply,
  rateLimitReply,
  unknownUserReply,
  invalidCommandReply,
  txErrorReply,
  lowTreasuryAlert,
  claimReply,
  rewardSweepReply,
} from '../utils/replies';

describe('replies', () => {
  it('launchSuccessReply contains token name and ticker', () => {
    const reply = launchSuccessReply('Moon Bread', 'BREAD', 'https://tx/123');
    expect(reply).toContain('BREAD');
    expect(reply).toContain('Moon Bread');
    expect(reply).toContain('https://tx/123');
  });

  it('buyFirstReply contains amount and ticker', () => {
    const reply = buyFirstReply('BREAD', 2.5, 'https://tx/456');
    expect(reply).toContain('2.5');
    expect(reply).toContain('BREAD');
  });

  it('delegateSuccessReply mentions 24 hours and ticker', () => {
    const reply = delegateSuccessReply('Moon Bread', 'BREAD');
    expect(reply).toContain('BREAD');
    expect(reply).toContain('24');
  });

  it('registerSuccessReply shows truncated address', () => {
    const addr = '0x' + 'a'.repeat(64);
    const reply = registerSuccessReply(addr);
    expect(reply).toContain('0xaaaa');
    expect(reply).toContain('aaaa');
  });

  it('rateLimitReply mentions remaining hours', () => {
    const reply = rateLimitReply(3.7);
    expect(reply).toContain('4'); // Math.ceil(3.7) = 4
  });

  it('unknownUserReply mentions register command', () => {
    const reply = unknownUserReply();
    expect(reply.toLowerCase()).toContain('register');
  });

  it('invalidCommandReply shows command examples', () => {
    const reply = invalidCommandReply();
    expect(reply.toLowerCase()).toContain('launch');
    expect(reply.toLowerCase()).toContain('delegate');
    expect(reply.toLowerCase()).toContain('register');
  });

  it('txErrorReply contains action and error message', () => {
    const reply = txErrorReply('launch', 'out of gas');
    expect(reply).toContain('launch');
    expect(reply).toContain('out of gas');
  });

  it('lowTreasuryAlert shows balance and threshold', () => {
    const reply = lowTreasuryAlert(2.3456);
    expect(reply).toContain('2.3456');
    expect(reply).toContain('5 SUI');
  });

  it('claimReply shows ticker and amount', () => {
    const reply = claimReply('BREAD', 1.5);
    expect(reply).toContain('BREAD');
    expect(reply).toContain('1.5');
  });

  it('rewardSweepReply shows ticker, amount, and recipient', () => {
    const reply = rewardSweepReply('BREAD', 0.25, '0xaaaa...bbbb');
    expect(reply).toContain('BREAD');
    expect(reply).toContain('0.25');
    expect(reply).toContain('0xaaaa...bbbb');
  });
});
