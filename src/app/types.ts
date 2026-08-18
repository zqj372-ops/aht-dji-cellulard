export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'completed'
  | 'error'
  | 'disconnected';

export type Availability =
  | 'stable'
  | 'beta'
  | 'developer_preview'
  | 'generic'
  | 'unavailable'
  | 'planned';
export type InboxKind = 'approval' | 'question' | 'completed' | 'error' | 'security' | 'server_alert';
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
  type: string;
  displayName: string;
  shortName: string;
  model: string | null;
  server: string | null;
  workspace: string | null;
  session: string | null;
  icon: string;
  status: AgentStatus;
  availability: Availability;
  project: string;
  summary: string;
  currentTask: string | null;
  elapsed: number | null;
  needsUser: boolean;
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
  actions?: Decision[];
  createdAt?: string;
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
  dataSource: 'fixture' | 'gateway';
}

export interface FixtureState {
  agents: Agent[];
  inbox: InboxItem[];
  servers: ServerSnapshot[];
  network: { link: 'Wi-Fi' | '4G' | 'offline'; rtt: number; vpn: boolean; signal: number };
  battery: number;
  display: { width: 1024; height: 768; refreshRate: 60; rotation: 0; panel: 'gh7003' };
}
