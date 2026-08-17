import { expect, test } from 'vitest';
import { applyGatewayEvent, toFixtureState } from '../../src/providers/gateway/reducer';
import type { GatewaySnapshot } from '../../src/providers/protocol';

const snapshot: GatewaySnapshot = {
  schema_version: 1,
  revision: 7,
  event_id: 'evt-7',
  generated_at: '2026-08-18T03:00:00.000Z',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
    workspace: '/aht', session: 'codex-remote-1', status: 'waiting_approval',
    current_task: '生产部署审批', elapsed_seconds: 23, needs_user: true,
    maturity: 'beta', capabilities: { approval: true },
  }],
  needs_you: [{
    id: 'remote-approval', agent_id: 'codex', type: 'approval', title: '远程审批',
    detail: '来自 Gateway 的审批', risk: 'high', created_at: '2026-08-17T12:00:00Z',
    status: 'pending', actions: ['approve', 'reject'],
  }],
  servers: [],
  network: { link: '4G', rtt_ms: 38, vpn: true },
};

test('maps a Gateway snapshot into the existing UI state without fixture records', () => {
  const state = toFixtureState(snapshot);

  expect(state.inbox).toHaveLength(1);
  expect(state.inbox[0]?.id).toBe('remote-approval');
  expect(state.inbox[0]?.detail).toBe('来自 Gateway 的审批');
  expect(state.agents[0]?.session).toBe('codex-remote-1');
  expect(state.servers).toHaveLength(0);
  expect(state.network.rtt).toBe(38);
});

test('applies a needs-you resolution as a new Gateway snapshot revision', () => {
  const next = applyGatewayEvent(snapshot, {
    type: 'needs_you_resolved',
    needs_you_id: 'remote-approval',
    status: 'approved',
  });

  expect(next.revision).toBe(8);
  expect(next.event_id).toBe('evt-7');
  expect(next.needs_you[0]?.status).toBe('approved');
});
