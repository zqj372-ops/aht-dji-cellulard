import { describe, expect, test } from 'vitest';
import type { GatewaySnapshot } from '../../src/providers/protocol';
import {
  deriveGatewaySnapshotTrust,
  getDecisionGate,
} from '../../src/providers/trust';

const snapshot: GatewaySnapshot = {
  schema_version: 1,
  revision: 4,
  event_id: 'evt-4',
  generated_at: '1970-01-01T00:01:40.000Z',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [],
  needs_you: [],
  servers: [],
  network: null,
};

describe('Gateway snapshot trust', () => {
  test('marks a recent Gateway snapshot fresh only with needs_you:write scope', () => {
    const trust = deriveGatewaySnapshotTrust(snapshot, 100_000, 100_000, 30_000);

    expect(trust.freshness).toBe('fresh');
    expect(getDecisionGate('gateway', 'connected', trust)).toEqual({ allowed: true, reason: null });
  });

  test('blocks a stale Gateway snapshot before sending a command', () => {
    const trust = deriveGatewaySnapshotTrust(snapshot, 100_000, 140_001, 30_000);

    expect(trust.freshness).toBe('stale');
    expect(getDecisionGate('gateway', 'connected', trust).reason).toBe('gateway_snapshot_stale');
  });

  test('blocks a connected Gateway snapshot without write permission', () => {
    const trust = deriveGatewaySnapshotTrust(
      { ...snapshot, permission_scope: ['needs_you:read'] },
      100_000,
      100_000,
      30_000,
    );

    expect(getDecisionGate('gateway', 'connected', trust)).toEqual({
      allowed: false,
      reason: 'permission_denied',
    });
  });
});
