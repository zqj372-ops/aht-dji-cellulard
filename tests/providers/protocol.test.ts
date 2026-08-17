import { describe, expect, test } from 'vitest';
import { parseGatewayServerMessage } from '../../src/providers/protocol';

describe('aht.gateway.v1 protocol', () => {
  test('parses a canonical snapshot without changing its authority fields', () => {
    const message = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
      event_id: 'evt-42',
      snapshot: {
        schema_version: 1,
        revision: 42,
        event_id: 'evt-42',
        agents: [],
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
  });

  test('rejects malformed and unknown messages as a typed protocol error', () => {
    const message = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
      snapshot: { agents: [] },
    });

    expect(message.type).toBe('protocol_error');
    if (message.type !== 'protocol_error') throw new Error('expected protocol error');
    expect(message.code).toBe('invalid_snapshot');
  });
});
