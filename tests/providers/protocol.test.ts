import { describe, expect, test } from 'vitest';
import { parseGatewayServerMessage } from '../../src/providers/protocol';

describe('aht.gateway.v1 protocol', () => {
  test('parses a canonical snapshot without changing its authority fields', () => {
    const message = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
      message_id: 'msg-snapshot',
      event_id: 'evt-42',
      snapshot: {
        source: 'gateway',
        schema_version: 1,
        revision: 42,
        event_id: 'evt-42',
        generated_at: '2026-08-18T03:00:00.000Z',
        tenant_id: 'tenant-01',
        principal_id: 'user-01',
        device_id: 'device-01',
        permission_scope: ['needs_you:read', 'needs_you:write'],
        agents: [],
        sessions: [],
        needs_you: [],
        servers: [],
        network: null,
      },
    });

    expect(message.type).toBe('snapshot');
    if (message.type !== 'snapshot') throw new Error('expected snapshot');
    expect(message.event_id).toBe('evt-42');
    expect(message.snapshot.schema_version).toBe(1);
    expect(message.snapshot.revision).toBe(42);
    expect(message.snapshot.generated_at).toBe('2026-08-18T03:00:00.000Z');
    expect(message.snapshot.permission_scope).toEqual(['needs_you:read', 'needs_you:write']);
  });

  test('rejects malformed and unknown messages as a typed protocol error', () => {
    const message = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
      message_id: 'msg-snapshot',
      snapshot: { agents: [] },
    });

    expect(message.type).toBe('protocol_error');
    if (message.type !== 'protocol_error') throw new Error('expected protocol error');
    expect(message.code).toBe('invalid_snapshot');
  });

  test('rejects a snapshot without Gateway authority metadata', () => {
    const message = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
      message_id: 'msg-snapshot',
      event_id: 'evt-43',
      snapshot: {
        source: 'gateway',
        schema_version: 1,
        revision: 43,
        event_id: 'evt-43',
        generated_at: '2026-08-18T03:00:00.000Z',
        tenant_id: '',
        principal_id: 'user-01',
        device_id: 'device-01',
        permission_scope: ['needs_you:read'],
        agents: [],
        sessions: [],
        needs_you: [],
        servers: [],
        network: null,
      },
    });

    expect(message).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_snapshot' }));
  });
});
