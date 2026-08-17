import { useMemo, useState } from 'react';
import { decideInboxItem, fixtureState, getNeedsYouCount } from './fixtureState';
import type { Decision, Screen } from './types';
import { useHardwareShortcuts } from './useHardwareShortcuts';
import { DeviceFrame } from '../components/DeviceFrame';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { HomeScreen } from '../screens/HomeScreen';
import { NeedsYouScreen } from '../screens/NeedsYouScreen';
import { AgentsScreen } from '../screens/AgentsScreen';
import { ServersScreen } from '../screens/ServersScreen';
import { TerminalScreen } from '../screens/TerminalScreen';

export function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [state, setState] = useState(fixtureState);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  useHardwareShortcuts({ onNavigate: setCurrentScreen, onBack: () => setSelectedInboxId(null) });
  const selectedItem = state.inbox.find((item) => item.id === selectedInboxId) ?? null;
  const selectedAgent = useMemo(
    () => selectedItem ? state.agents.find((agent) => agent.id === selectedItem.agentId) ?? null : null,
    [selectedItem, state.agents],
  );

  const openInboxItem = (itemId: string) => setSelectedInboxId(itemId);
  const decide = (decision: Decision) => {
    if (!selectedInboxId) return;
    setState((current) => decideInboxItem(current, selectedInboxId, decision));
  };

  const screen = selectedItem && selectedAgent ? (
    <ApprovalPanel item={selectedItem} agent={selectedAgent} onDecision={decide} onBack={() => setSelectedInboxId(null)} />
  ) : currentScreen === 'needs' ? (
    <NeedsYouScreen inbox={state.inbox} agents={state.agents} onOpen={openInboxItem} />
  ) : currentScreen === 'agents' ? (
    <AgentsScreen agents={state.agents} />
  ) : currentScreen === 'servers' ? (
    <ServersScreen servers={state.servers} />
  ) : currentScreen === 'terminal' ? (
    <TerminalScreen />
  ) : (
    <HomeScreen inbox={state.inbox} agents={state.agents} onOpen={openInboxItem} />
  );

  return (
    <DeviceFrame state={state} currentScreen={currentScreen} onNavigate={setCurrentScreen}>
      {screen}
      <p className="fixture-note">本地模拟数据 · {getNeedsYouCount(state)} 项待处理 · 面板 {state.display.panel}</p>
    </DeviceFrame>
  );
}
