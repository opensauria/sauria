import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock machine-id ──────────────────────────────────────────────
const mockMachineId = vi.fn(() => 'TEST-UUID-1234');

vi.mock('../machine-id.js', () => ({
  machineId: () => mockMachineId(),
}));

// ─── Mock node:os ─────────────────────────────────────────────────
const mockUserInfo = vi.fn(() => ({ username: 'testuser' }));

vi.mock('node:os', () => ({
  userInfo: () => mockUserInfo(),
}));

// Import after mocks
const { deriveVaultPassword } = await import('../derive-password.js');

describe('deriveVaultPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMachineId.mockReturnValue('TEST-UUID-1234');
    mockUserInfo.mockReturnValue({ username: 'testuser' });
  });

  it('returns a string', () => {
    const result = deriveVaultPassword();
    expect(typeof result).toBe('string');
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const result = deriveVaultPassword();
    expect(result.length).toBe(64);
  });

  it('contains only hex characters', () => {
    const result = deriveVaultPassword();
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic with same inputs', () => {
    const a = deriveVaultPassword();
    const b = deriveVaultPassword();
    expect(a).toBe(b);
  });

  it('changes when machineId differs', () => {
    const a = deriveVaultPassword();

    mockMachineId.mockReturnValue('DIFFERENT-UUID');
    const b = deriveVaultPassword();

    expect(a).not.toBe(b);
  });

  it('changes when username differs', () => {
    const a = deriveVaultPassword();

    mockUserInfo.mockReturnValue({ username: 'otheruser' });
    const b = deriveVaultPassword();

    expect(a).not.toBe(b);
  });

  it('calls machineId and userInfo', () => {
    deriveVaultPassword();
    expect(mockMachineId).toHaveBeenCalled();
    expect(mockUserInfo).toHaveBeenCalled();
  });

  it('produces different output for different machine+user combos', () => {
    mockMachineId.mockReturnValue('A');
    mockUserInfo.mockReturnValue({ username: 'alice' });
    const a = deriveVaultPassword();

    mockMachineId.mockReturnValue('B');
    mockUserInfo.mockReturnValue({ username: 'bob' });
    const b = deriveVaultPassword();

    expect(a).not.toBe(b);
  });
});
