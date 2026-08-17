import type { FixtureState, Screen } from '../app/types';
import { NavigationBar } from './NavigationBar';
import { StatusBar } from './StatusBar';
import { VoiceControl } from './VoiceControl';

interface DeviceFrameProps {
  state: FixtureState;
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  children: React.ReactNode;
}

export function DeviceFrame({ state, currentScreen, onNavigate, children }: DeviceFrameProps) {
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
