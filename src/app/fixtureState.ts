import codexIcon from '../assets/agents/codex-color.svg';
import deepseekIcon from '../assets/agents/deepseek-color.svg';
import claudeCodeIcon from '../assets/agents/claudecode-color.svg';
import geminiCliIcon from '../assets/agents/geminicli-color.svg';
import hermesIcon from '../assets/agents/hermesagent.svg';
import openClawIcon from '../assets/agents/openclaw-color.svg';
import openCodeIcon from '../assets/agents/opencode.svg';
import type { Decision, FixtureState } from './types';

export const iconAssetVersion = '@lobehub/icons-static-svg@1.94.0';

const commonCapabilities = {
  prompt: true,
  sessions: true,
  approval: true,
  stop: true,
  steer: true,
  tasks: true,
  artifacts: true,
  modelSwitch: false,
  usage: true,
  terminal: true,
} as const;

export const fixtureState: FixtureState = {
  agents: [
    {
      id: 'codex', displayName: 'Codex', shortName: 'codex', icon: codexIcon,
      status: 'waiting_approval', availability: 'stable', project: 'AHT Client',
      summary: '确认部署到生产环境', capabilities: commonCapabilities,
    },
    {
      id: 'deepseek-harness', displayName: 'DeepSeek Harness', shortName: 'dsh', icon: deepseekIcon,
      status: 'waiting_input', availability: 'developer_preview', project: 'dsh Web UI',
      summary: '插件状态待确认', capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'claude-code', displayName: 'Claude Code', shortName: 'claude', icon: claudeCodeIcon,
      status: 'completed', availability: 'stable', project: 'AHT Client',
      summary: '代码审查完成', capabilities: commonCapabilities,
    },
    {
      id: 'gemini-cli', displayName: 'Gemini CLI', shortName: 'gemini', icon: geminiCliIcon,
      status: 'running', availability: 'stable', project: 'AHT Client',
      summary: '正在执行任务', capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'hermes-agent', displayName: 'Hermes Agent', shortName: 'hermes', icon: hermesIcon,
      status: 'waiting_input', availability: 'stable', project: 'AHT Client',
      summary: '等待兼容性确认', capabilities: commonCapabilities,
    },
    {
      id: 'openclaw', displayName: 'OpenClaw', shortName: 'openclaw', icon: openClawIcon,
      status: 'completed', availability: 'stable', project: 'AHT Client',
      summary: '研究任务已完成', capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'opencode', displayName: 'opencode', shortName: 'opencode', icon: openCodeIcon,
      status: 'error', availability: 'stable', project: 'AHT Client',
      summary: '任务需要重新运行', capabilities: commonCapabilities,
    },
  ],
  inbox: [
    {
      id: 'codex-production-approval', agentId: 'codex', kind: 'approval',
      title: '确认部署到生产环境', detail: '当前分支已经准备好，是否继续执行生产部署？',
      risk: 'high', timeLabel: '现在', status: 'pending',
    },
    {
      id: 'deepseek-harness-preview', agentId: 'deepseek-harness', kind: 'question',
      title: '确认 dsh 插件状态', detail: 'DeepSeek Harness 处于开发者预览，是否继续显示该 Agent？',
      risk: 'medium', timeLabel: '新', status: 'pending',
    },
    {
      id: 'claude-code-review', agentId: 'claude-code', kind: 'completed',
      title: '代码审查完成', detail: 'Claude Code 已完成当前变更的审查摘要。',
      risk: 'low', timeLabel: '2 分钟', status: 'pending',
    },
    {
      id: 'openclaw-research', agentId: 'openclaw', kind: 'error',
      title: '研究任务需要查看', detail: 'OpenClaw 已完成研究，但有一项结果需要人工复核。',
      risk: 'medium', timeLabel: '5 分钟', status: 'pending',
    },
  ],
  servers: [{
    id: 'tokyo-01', displayName: 'TOKYO-01', status: 'online', rtt: 42,
    cpu: 28, ram: 46, disk: 63, load: 0.72, dockerRunning: 18,
    dockerRestarting: 1, gateway: 'online', tailscale: 'online', ssh: 'online', dataSource: 'fixture',
  }],
  network: { link: '4G', rtt: 46, vpn: true, signal: 4 },
  battery: 82,
  display: { width: 1024, height: 768, refreshRate: 60, rotation: 0, panel: 'gh7003' },
};

export function getNeedsYouCount(state: FixtureState): number {
  return state.inbox.filter((item) => item.status === 'pending').length;
}

export function decideInboxItem(
  state: FixtureState,
  itemId: string,
  decision: Decision,
): FixtureState {
  const nextStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'deferred';
  return {
    ...state,
    inbox: state.inbox.map((item) => item.id === itemId ? { ...item, status: nextStatus } : item),
  };
}
