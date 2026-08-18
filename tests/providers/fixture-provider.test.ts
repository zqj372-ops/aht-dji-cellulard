import { describe, expect, test } from 'vitest';
import { FixtureProvider } from '../../src/providers/fixture/FixtureProvider';

describe('FixtureProvider', () => {
  test('emits a local snapshot and applies a decision without a network', async () => {
    const provider = new FixtureProvider();
    const events: Array<{ type: string; snapshot?: { inbox: Array<{ id: string; status: string }> } }> = [];
    provider.subscribe((event) => events.push(event as typeof events[number]));

    provider.connect();

    expect(provider.source).toBe('fixture');
    expect(events.map((event) => event.type)).toEqual(['connection', 'snapshot']);

    const ack = await provider.decide({
      itemId: 'codex-production-approval',
      agentId: 'codex',
      decision: 'approve',
    });

    expect(ack.status).toBe('accepted');
    const latestSnapshot = events.filter((event) => event.type === 'snapshot').at(-1);
    expect(latestSnapshot?.snapshot?.inbox.find((item) => item.id === 'codex-production-approval')?.status)
      .toBe('approved');
    expect(() => provider.disconnect()).not.toThrow();
  });
});
