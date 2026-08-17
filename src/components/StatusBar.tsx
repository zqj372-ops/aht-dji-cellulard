import type { FixtureState } from '../app/types';

interface StatusBarProps {
  network: FixtureState['network'];
  battery: number;
  display: FixtureState['display'];
}

export function StatusBar({ network, battery, display }: StatusBarProps) {
  return (
    <header className="status-bar" aria-label="设备状态">
      <div className="status-bar__left">
        <span className="status-dot" aria-hidden="true" />
        <span>{network.link}</span>
        <span className="signal-bars" aria-label={`${network.signal} 格信号`}>
          {'▮'.repeat(network.signal)}
        </span>
        <span>{network.rtt}ms</span>
        <span className="status-vpn">VPN {network.vpn ? '●' : '○'}</span>
      </div>
      <div className="status-bar__right">
        <span className="display-contract">{display.width} × {display.height}</span>
        <span className="display-refresh">· {display.refreshRate} Hz</span>
        <span>电量 {battery}%</span>
      </div>
    </header>
  );
}
