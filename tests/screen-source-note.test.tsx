import { render, screen } from '@testing-library/react';
import { ScreenSourceNote } from '../src/components/ScreenSourceNote';
import { ServersScreen } from '../src/screens/ServersScreen';
import { fixtureState } from '../src/providers/fixture/fixtureState';
import type { SnapshotTrust } from '../src/providers/types';

const freshTrust: SnapshotTrust = {
  source: 'gateway',
  eventId: 'evt-2',
  revision: 2,
  generatedAt: '2026-08-18T03:00:00.000Z',
  receivedAt: '2026-08-18T03:00:01.000Z',
  freshness: 'fresh',
  staleReason: null,
  permissionScope: ['needs_you:read'],
};

describe('ScreenSourceNote', () => {
  test('labels fixture data instead of inventing a gateway snapshot', () => {
    render(<ScreenSourceNote source="fixture" snapshotTrust={{ ...freshTrust, source: 'fixture' }} readOnlyLabel="只读状态概览" />);
    expect(screen.getByTestId('screen-source-note')).toHaveTextContent('本地模拟数据 · 只读状态概览 · 无 Gateway 会话');
  });

  test('shows gateway authority, snapshot revision and freshness when fresh', () => {
    render(<ScreenSourceNote source="gateway" snapshotTrust={freshTrust} readOnlyLabel="只读状态概览" />);
    const note = screen.getByTestId('screen-source-note');
    expect(note).toHaveTextContent('Gateway authority 数据 · 只读状态概览');
    expect(note).toHaveTextContent('快照 evt-2 r2');
    expect(note).toHaveTextContent('新鲜');
    expect(note).toHaveTextContent('生成 2026-08-18T03:00:00Z');
  });

  test('surfaces a stale snapshot with its reason', () => {
    render(
      <ScreenSourceNote
        source="gateway"
        snapshotTrust={{ ...freshTrust, freshness: 'stale', staleReason: 'snapshot_expired' }}
        readOnlyLabel="只读健康概览"
      />,
    );
    expect(screen.getByTestId('screen-source-note')).toHaveTextContent('陈旧（snapshot_expired）');
  });
});

describe('read-only screen source consistency', () => {
  test('Servers page shows gateway authority instead of the old hardcoded fixture label', () => {
    render(<ServersScreen servers={fixtureState.servers} source="gateway" snapshotTrust={freshTrust} />);
    expect(screen.getByTestId('screen-source-note')).toHaveTextContent('Gateway authority 数据 · 只读健康概览');
    expect(screen.queryByText('FIXTURE')).toBeNull();
    expect(screen.queryByText(/本地模拟数据/)).toBeNull();
  });
});
