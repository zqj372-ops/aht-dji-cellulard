import type { FixtureState } from '../app/types';

export const emptyState: FixtureState = {
  agents: [],
  inbox: [],
  servers: [],
  network: { link: 'offline', rtt: 0, vpn: false, signal: 0 },
  battery: 82,
  display: { width: 1024, height: 768, refreshRate: 60, rotation: 0, panel: 'gh7003' },
};
