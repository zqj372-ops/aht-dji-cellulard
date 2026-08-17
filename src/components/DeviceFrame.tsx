import type { FixtureState, Screen } from '../app/types';
import { NavigationBar } from './NavigationBar';
import { StatusBar } from './StatusBar';
import { VoiceControl } from './VoiceControl';
import { ConnectionStatus } from './ConnectionStatus';
import { DataSourceControl } from './DataSourceControl';
import type { ConnectionState, DataSource } from '../providers/types';

interface DeviceFrameProps {
  state: FixtureState;
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  source: DataSource;
  connection: ConnectionState;
  stale: boolean;
  error: string | null;
  onSourceChange: (source: DataSource) => void;
  children: React.ReactNode;
}

export function DeviceFrame({ state, currentScreen, onNavigate, source, connection, stale, error, onSourceChange, children }: DeviceFrameProps) {
  return (
    <main className="app-shell">
      <div className="simulator-stage">
        <div
          className="device-viewport"
          data-testid="device-viewport"
          data-logical-size="1024x768"
          aria-label="AHT 1024×768 模拟屏"
        >
          <StatusBar network={state.network} battery={state.battery} display={state.display} />
          <div className="device-content">{children}</div>
          <div className="runtime-footer">
            <ConnectionStatus source={source} connection={connection} stale={stale} error={error} />
            <DataSourceControl source={source} onChange={onSourceChange} />
          </div>
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
