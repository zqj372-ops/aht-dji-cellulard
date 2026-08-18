import codexIcon from '../../assets/agents/codex-color.svg';
import deepseekIcon from '../../assets/agents/deepseek-color.svg';
import claudeCodeIcon from '../../assets/agents/claudecode-color.svg';
import geminiCliIcon from '../../assets/agents/geminicli-color.svg';
import hermesIcon from '../../assets/agents/hermesagent.svg';
import openClawIcon from '../../assets/agents/openclaw-color.svg';
import openCodeIcon from '../../assets/agents/opencode.svg';
import type { Decision, FixtureState } from '../../app/types';

export const iconAssetVersion = '@lobehub/icons-static-svg@1.94.0';

export const agentIconsByType: Record<string, string> = {
  codex: codexIcon,
  'deepseek-harness': deepseekIcon,
  'claude-code': claudeCodeIcon,
  'gemini-cli': geminiCliIcon,
  'hermes-agent': hermesIcon,
  openclaw: openClawIcon,
  opencode: openCodeIcon,
};

export function resolveAgentIcon(type: string): string {
  return agentIconsByType[type] ?? '';
}

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
      id: 'codex', type: 'codex', displayName: 'Codex', shortName: 'codex',
      model: 'codex', server: 'tokyo-01', workspace: '/aht', session: 'codex-001', icon: codexIcon,
      status: 'waiting_approval', availability: 'beta', project: 'AHT Client',
      summary: '确认部署到生产环境', currentTask: '生产部署审批', elapsed: 184, needsUser: true,
      capabilities: commonCapabilities,
    },
    {
      id: 'deepseek-harness', type: 'deepseek-harness', displayName: 'DeepSeek Harness', shortName: 'dsh',
      model: 'deepseek', server: 'tokyo-01', workspace: '/aht/dsh', session: 'dsh-001', icon: deepseekIcon,
      status: 'waiting_input', availability: 'developer_preview', project: 'dsh Web UI',
      summary: '插件状态待确认', currentTask: '确认 dsh 插件状态', elapsed: 91, needsUser: true,
      capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'claude-code', type: 'claude-code', displayName: 'Claude Code', shortName: 'claude',
      model: 'claude', server: 'tokyo-01', workspace: '/aht', session: 'claude-001', icon: claudeCodeIcon,
      status: 'completed', availability: 'beta', project: 'AHT Client',
      summary: '代码审查完成', currentTask: null, elapsed: null, needsUser: false,
      capabilities: commonCapabilities,
    },
    {
      id: 'gemini-cli', type: 'gemini-cli', displayName: 'Gemini CLI', shortName: 'gemini',
      model: 'gemini', server: 'tokyo-01', workspace: '/aht', session: 'gemini-001', icon: geminiCliIcon,
      status: 'running', availability: 'beta', project: 'AHT Client',
      summary: '正在执行任务', currentTask: '生成变更摘要', elapsed: 312, needsUser: false,
      capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'hermes-agent', type: 'hermes-agent', displayName: 'Hermes Agent', shortName: 'hermes',
      model: 'hermes', server: 'tokyo-01', workspace: '/aht', session: 'hermes-001', icon: hermesIcon,
      status: 'waiting_input', availability: 'beta', project: 'AHT Client',
      summary: '等待兼容性确认', currentTask: '等待兼容性确认', elapsed: 240, needsUser: true,
      capabilities: commonCapabilities,
    },
    {
      id: 'openclaw', type: 'openclaw', displayName: 'OpenClaw', shortName: 'openclaw',
      model: 'openclaw', server: 'tokyo-01', workspace: '/aht', session: 'openclaw-001', icon: openClawIcon,
      status: 'completed', availability: 'beta', project: 'AHT Client',
      summary: '研究任务已完成', currentTask: null, elapsed: null, needsUser: false,
      capabilities: { ...commonCapabilities, modelSwitch: true },
    },
    {
      id: 'opencode', type: 'opencode', displayName: 'opencode', shortName: 'opencode',
      model: 'opencode', server: 'tokyo-01', workspace: '/aht', session: 'opencode-001', icon: openCodeIcon,
      status: 'error', availability: 'developer_preview', project: 'AHT Client',
      summary: '任务需要重新运行', currentTask: '重新运行失败任务', elapsed: 36, needsUser: true,
      capabilities: commonCapabilities,
    },
  ],
  inbox: [
    {
      id: 'codex-production-approval', agentId: 'codex', kind: 'approval',
      title: '确认部署到生产环境', detail: '当前分支已经准备好，是否继续执行生产部署？',
      risk: 'high', timeLabel: '现在', status: 'pending', actions: ['approve', 'reject', 'defer'],
    },
    {
      id: 'deepseek-harness-preview', agentId: 'deepseek-harness', kind: 'question',
      title: '确认 dsh 插件状态', detail: 'DeepSeek Harness 处于开发者预览，是否继续显示该 Agent？',
      risk: 'medium', timeLabel: '新', status: 'pending', actions: ['defer'],
    },
    {
      id: 'claude-code-review', agentId: 'claude-code', kind: 'completed',
      title: '代码审查完成', detail: 'Claude Code 已完成当前变更的审查摘要。',
      risk: 'low', timeLabel: '2 分钟', status: 'pending', actions: ['defer'],
    },
    {
      id: 'openclaw-research', agentId: 'openclaw', kind: 'error',
      title: '研究任务需要查看', detail: 'OpenClaw 已完成研究，但有一项结果需要人工复核。',
      risk: 'medium', timeLabel: '5 分钟', status: 'pending', actions: ['defer'],
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
