import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ApprovalPanel } from '../src/components/ApprovalPanel';
import { fixtureState } from '../src/providers/fixture/fixtureState';
import type { DecisionGate } from '../src/providers/types';

const item = fixtureState.inbox[0];
const agent = fixtureState.agents.find((candidate) => candidate.id === item?.agentId);

if (!item || !agent) throw new Error('fixture approval test data is incomplete');

const approvalItem = item;
const approvalAgent = agent;

function renderApproval(decisionGate: DecisionGate, source: 'fixture' | 'gateway' = 'gateway') {
  return render(
    <ApprovalPanel
      item={approvalItem}
      agent={approvalAgent}
      source={source}
      decisionGate={decisionGate}
      onDecision={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

describe('ApprovalPanel decision gate', () => {
  test('keeps fixture decisions available', () => {
    renderApproval({ allowed: true, reason: null }, 'fixture');

    expect(screen.getByRole('button', { name: '批准' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '稍后' })).not.toBeDisabled();
  });

  test('disables every remote decision when the Gateway snapshot is stale', () => {
    renderApproval({ allowed: false, reason: 'gateway_snapshot_stale' });

    expect(screen.getByRole('button', { name: '批准' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '稍后' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('数据已陈旧');
  });

  test('disables every remote decision without write permission', () => {
    renderApproval({ allowed: false, reason: 'permission_denied' });

    expect(screen.getByRole('button', { name: '批准' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '稍后' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('写入权限');
  });
});
