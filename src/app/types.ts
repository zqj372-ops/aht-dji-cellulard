export type AgentStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'completed'
  | 'error'
  | 'stopped'
  | 'disconnected';

export type Availability = 'stable' | 'developer_preview';
export type InboxKind = 'approval' | 'question' | 'completed' | 'error';
export type RiskLevel = 'low' | 'medium' | 'high';
export type Decision = 'approve' | 'reject' | 'defer';
export type Screen = 'home' | 'needs' | 'agents' | 'servers' | 'terminal';

export interface AgentCapabilitySet {
  prompt: boolean;
  sessions: boolean;
  approval: boolean;
  stop: boolean;
  steer: boolean;
  tasks: boolean;
  artifacts: boolean;
  modelSwitch: boolean;
  usage: boolean;
  terminal: boolean;
}

export interface Agent {
  id: string;
  displayName: string;
  shortName: string;
  icon: string;
  status: AgentStatus;
  availability: Availability;
  project: string;
  summary: string;
  capabilities: AgentCapabilitySet;
}

export interface InboxItem {
  id: string;
  agentId: string;
  kind: InboxKind;
  title: string;
  detail: string;
  risk: RiskLevel;
  timeLabel: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
}

export interface ServerSnapshot {
  id: string;
  displayName: string;
  status: 'online' | 'offline' | 'degraded';
  rtt: number;
  cpu: number;
  ram: number;
  disk: number;
  load: number;
  dockerRunning: number;
  dockerRestarting: number;
  gateway: 'online' | 'offline';
  tailscale: 'online' | 'offline';
  ssh: 'online' | 'offline';
  dataSource: 'fixture';
}

export interface FixtureState {
  agents: Agent[];
  inbox: InboxItem[];
  servers: ServerSnapshot[];
  network: { link: 'Wi-Fi' | '4G'; rtt: number; vpn: boolean; signal: number };
  battery: number;
  display: { width: 1024; height: 768; refreshRate: 60; rotation: 0; panel: 'gh7003' };
}
