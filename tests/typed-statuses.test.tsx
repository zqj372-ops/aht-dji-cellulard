import { render, screen } from '@testing-library/react';
import { AgentsScreen } from '../src/screens/AgentsScreen';
import { InboxCard } from '../src/components/InboxCard';
import { fixtureState } from '../src/providers/fixture/fixtureState';

test('renders the unified security inbox kind and disconnected Agent status', () => {
  const agent = fixtureState.agents[0];
  render(
    <>
      <InboxCard
        agent={agent}
        item={{
          id: 'security-1', agentId: agent.id, kind: 'security', title: '需要安全确认',
          detail: '确认设备身份', risk: 'high', timeLabel: '现在', status: 'pending',
        }}
        onOpen={() => undefined}
      />
      <AgentsScreen agents={[{ ...agent, status: 'disconnected' }]} />
    </>,
  );

  expect(screen.getByText('需要安全确认')).toBeInTheDocument();
  expect(screen.getByText('安全确认')).toBeInTheDocument();
  expect(screen.getByText('已断开')).toBeInTheDocument();
});
