import type { FixtureState, Screen } from '../app/types';
import { NavigationBar } from './NavigationBar';
import { StatusBar } from './StatusBar';
import { VoiceControl } from './VoiceControl';
import { ConnectionStatus } from './ConnectionStatus';
import { DataSourceControl } from './DataSourceControl';
import { SessionContextBar } from './SessionContextBar';
import { PairingPanel } from './PairingPanel';
import type { ConnectionState, DataSource, PairingState } from '../providers/types';
import type { ProviderAuthorization, SnapshotTrust } from '../providers/types';

interface DeviceFrameProps {
  state: FixtureState;
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  source: DataSource;
  connection: ConnectionState;
  stale: boolean;
  error: string | null;
  authorization: ProviderAuthorization;
  snapshotTrust: SnapshotTrust;
  pairing: PairingState;
  onSourceChange: (source: DataSource) => void;
  onBeginPairing: () => void;
  onConfirmPairing: (pairingId: string, code: string) => void;
  children: React.ReactNode;
}

export function DeviceFrame({
  state, currentScreen, onNavigate, source, connection, stale, error,
  authorization, snapshotTrust, pairing, onSourceChange, onBeginPairing, onConfirmPairing, children,
}: DeviceFrameProps) {
  const showPairing = source === 'gateway'
    && (authorization.status === 'pairing_required'
      || connection === 'pairing_required'
      || pairing.status === 'challenge'
      || pairing.status === 'confirming'
      || pairing.status === 'paired'
      || pairing.status === 'rejected');
  return (
    <main className="app-shell">
      <div className="simulator-stage">
        <div
          className="device-viewport"
          data-testid="device-viewport"
          data-logical-size="1024x768"
          data-reference-layout="industrial"
          aria-label="AHT 1024×768 模拟屏"
        >
          <StatusBar network={state.network} battery={state.battery} display={state.display} />
          <div className="device-content">{children}</div>
          {showPairing && (
            <PairingPanel
              pairing={pairing}
              onBeginPairing={onBeginPairing}
              onConfirmPairing={onConfirmPairing}
            />
          )}
          <div className="runtime-footer">
            <ConnectionStatus source={source} connection={connection} stale={stale} error={error} />
            <DataSourceControl source={source} onChange={onSourceChange} />
          </div>
          <SessionContextBar
            source={source}
            connection={connection}
            authorization={authorization}
            snapshotTrust={snapshotTrust}
          />
          <VoiceControl />
          <NavigationBar
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            agentCount={state.agents.length}
            serverCount={state.servers.length}
          />
        </div>
      </div>
    </main>
  );
}
