import { useMemo, useState } from 'react';
import { getNeedsYouCount } from './fixtureState';
import type { Decision, Screen } from './types';
import { useHardwareShortcuts } from './useHardwareShortcuts';
import { useAhtRuntime } from './useAhtRuntime';
import { DeviceFrame } from '../components/DeviceFrame';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { HomeScreen } from '../screens/HomeScreen';
import { NeedsYouScreen } from '../screens/NeedsYouScreen';
import { AgentsScreen } from '../screens/AgentsScreen';
import { ServersScreen } from '../screens/ServersScreen';
import { TerminalScreen } from '../screens/TerminalScreen';

export function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const runtime = useAhtRuntime();
  const { state } = runtime;
  const selectedItem = state.inbox.find((item) => item.id === selectedInboxId) ?? null;
  const selectedAgent = useMemo(
    () => selectedItem ? state.agents.find((agent) => agent.id === selectedItem.agentId) ?? null : null,
    [selectedItem, state.agents],
  );

  const openInboxItem = (itemId: string) => setSelectedInboxId(itemId);
  const decide = (decision: Decision) => {
    if (!selectedInboxId) return;
    if (!selectedAgent) return;
    if (!runtime.decisionGate.allowed) return;
    void runtime.decide({ itemId: selectedInboxId, agentId: selectedAgent.id, decision });
  };
  useHardwareShortcuts({
    onNavigate: setCurrentScreen,
    onBack: () => setSelectedInboxId(null),
    onApprove: selectedItem?.status === 'pending' && runtime.decisionGate.allowed ? () => decide('approve') : undefined,
    onReject: selectedItem?.status === 'pending' && runtime.decisionGate.allowed ? () => decide('reject') : undefined,
  });

  const screen = selectedItem && selectedAgent ? (
    <ApprovalPanel
      item={selectedItem}
      agent={selectedAgent}
      source={runtime.source}
      onDecision={decide}
      onBack={() => setSelectedInboxId(null)}
      decisionGate={runtime.decisionGate}
    />
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
    <DeviceFrame
      state={state}
      currentScreen={currentScreen}
      onNavigate={setCurrentScreen}
      source={runtime.source}
      connection={runtime.connection}
      stale={runtime.stale}
      error={runtime.error}
      onSourceChange={runtime.setSource}
    >
      {screen}
      <p className="fixture-note">
        {runtime.source === 'fixture' ? '本地模拟数据' : 'Gateway authority 数据'} · {getNeedsYouCount(state)} 项待处理 · 面板 {state.display.panel}
      </p>
    </DeviceFrame>
  );
}
