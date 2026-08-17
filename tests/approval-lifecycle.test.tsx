import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ApprovalPanel } from '../src/components/ApprovalPanel';
import { useAhtRuntime } from '../src/app/useAhtRuntime';
import { emptyState } from '../src/providers/emptyState';
import type {
  AhtProvider,
  CommandAck,
  DecisionCommand,
  ProviderEvent,
  SnapshotTrust,
} from '../src/providers/types';
import type { FixtureState } from '../src/app/types';

const trust: SnapshotTrust = {
  source: 'gateway', eventId: 'evt-1', revision: 1, generatedAt: '2026-08-18T03:00:00.000Z',
  receivedAt: '2026-08-18T03:00:00.000Z', freshness: 'fresh', staleReason: null,
  permissionScope: ['needs_you:read', 'needs_you:write'],
};

function gatewayState(status: 'pending' | 'approved' = 'pending'): FixtureState {
  return {
    ...emptyState,
    agents: [{
      id: 'codex', type: 'codex', displayName: 'Codex', shortName: 'Codex', model: 'codex', server: 'gateway',
      workspace: '/aht', session: 'session-aht', icon: 'C', status: status === 'pending' ? 'waiting_approval' : 'completed',
      availability: 'beta', project: 'AHT', summary: '审批', currentTask: '审批', elapsed: 1, needsUser: status === 'pending',
      capabilities: {
        prompt: true, sessions: true, approval: true, stop: true, steer: true, tasks: true,
        artifacts: true, modelSwitch: false, usage: true, terminal: true,
      },
    }],
    inbox: [{
      id: 'need-01', agentId: 'codex', kind: 'approval', title: '批准部署', detail: '等待 Gateway 审批', risk: 'high',
      timeLabel: 'Gateway', status, actions: ['approve', 'reject', 'defer'], createdAt: '2026-08-18T03:00:00.000Z',
    }],
  };
}

class HarnessProvider implements AhtProvider {
  readonly source = 'gateway' as const;
  private listener: ((event: ProviderEvent) => void) | null = null;
  private resolver: ((ack: CommandAck) => void) | null = null;
  decideCalls = 0;

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  connect(): void {
    this.emit({ type: 'connection', state: 'connected' });
    this.emit({ type: 'authorization', authorization: {
      status: 'authorized', sessionId: 'session-aht', principalId: 'user-01', tenantId: 'tenant-01',
      deviceId: 'device-01', permissionScope: trust.permissionScope, reason: null,
    } });
    this.emit({ type: 'snapshot', snapshot: gatewayState(), snapshotTrust: trust, eventId: 'evt-1', stale: false });
  }

  disconnect(): void {
    this.emit({ type: 'connection', state: 'disconnected', reason: 'test_cleanup' });
  }

  decide(_command: DecisionCommand): Promise<CommandAck> {
    this.decideCalls += 1;
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId: 'cmd-01', itemId: 'need-01', phase: 'sending', reason: null, sourceEventId: 'evt-1', finalEventId: null,
    } });
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  accept(): void {
    const ack: CommandAck = {
      commandId: 'cmd-01', status: 'accepted', phase: 'pending_event', reason: null, finalEventId: null, retryable: false,
    };
    this.resolver?.(ack);
    this.emit({ type: 'command_ack', ack });
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId: 'cmd-01', itemId: 'need-01', phase: 'gateway_accepted', reason: null, sourceEventId: 'evt-1', finalEventId: null,
    } });
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId: 'cmd-01', itemId: 'need-01', phase: 'waiting_final_event', reason: null, sourceEventId: 'evt-1', finalEventId: null,
    } });
  }

  finalize(): void {
    this.emit({ type: 'snapshot', snapshot: gatewayState('approved'), snapshotTrust: {
      ...trust, eventId: 'evt-2', revision: 2, generatedAt: '2026-08-18T03:00:01.000Z', receivedAt: '2026-08-18T03:00:01.000Z',
    }, eventId: 'evt-2', stale: false });
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId: 'cmd-01', itemId: 'need-01', phase: 'confirmed', reason: null, sourceEventId: 'evt-2', finalEventId: 'evt-2',
    } });
  }

  disconnectWhileWaiting(): void {
    this.emit({ type: 'connection', state: 'reconnecting', reason: 'gateway_closed' });
  }

  private emit(event: ProviderEvent): void {
    this.listener?.(event);
  }
}

function Harness({ provider }: { provider: HarnessProvider }) {
  const runtime = useAhtRuntime({
    initialSource: 'gateway',
    gatewayProviderFactory: () => provider,
  });
  const item = runtime.state.inbox.find((candidate) => candidate.id === 'need-01');
  const agent = runtime.state.agents.find((candidate) => candidate.id === 'codex');
  if (!item || !agent) return <p>waiting for Gateway snapshot</p>;
  return (
    <ApprovalPanel
      item={item}
      agent={agent}
      source={runtime.source}
      decisionGate={runtime.decisionGate}
      decisionLifecycle={runtime.decisionLifecycle[item.id] ?? null}
      onDecision={(decision) => { void runtime.decide({ itemId: item.id, agentId: agent.id, decision }); }}
      onBack={() => undefined}
    />
  );
}

describe('Gateway approval lifecycle', () => {
  let provider: HarnessProvider;

  afterEach(() => {
    act(() => provider?.disconnect());
  });

  test('keeps final UI status pending until the matching final event arrives', async () => {
    provider = new HarnessProvider();
    render(<Harness provider={provider} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '批准' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    expect(screen.getByRole('status')).toHaveTextContent('发送中');
    act(() => provider.accept());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('等待最终事件'));
    expect(screen.queryByText('已批准（Gateway）')).not.toBeInTheDocument();
    expect(provider.decideCalls).toBe(1);

    act(() => provider.finalize());
    await waitFor(() => expect(screen.getByText('已批准（Gateway）')).toBeInTheDocument());
  });

  test('shows result pending after disconnect and does not auto-resubmit', async () => {
    provider = new HarnessProvider();
    render(<Harness provider={provider} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '批准' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    act(() => provider.accept());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('等待最终事件'));

    act(() => provider.disconnectWhileWaiting());
    await waitFor(() => expect(screen.getByText(/结果待确认/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '批准' })).not.toBeInTheDocument();
    expect(provider.decideCalls).toBe(1);
  });
});
