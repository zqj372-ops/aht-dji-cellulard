let eventSequence = 1;

export function nextGatewayEventId() {
  eventSequence += 1;
  return `evt-${eventSequence}`;
}

export function createGatewaySnapshot({ deviceId = 'device-01' } = {}) {
  const generatedAt = new Date().toISOString();
  return {
    source: 'gateway',
    schema_version: 1,
    revision: 1,
    event_id: 'evt-1',
    generated_at: generatedAt,
    tenant_id: 'reference-tenant',
    principal_id: 'reference-user',
    device_id: deviceId,
    permission_scope: ['agents:read', 'sessions:read', 'needs_you:read', 'needs_you:write', 'servers:read'],
    agents: [
      {
        id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
        workspace: '/srv/aht', session: 'codex-gateway-001', status: 'waiting_approval',
        current_task: '生产部署审批', elapsed_seconds: 48, needs_user: true,
        maturity: 'beta', capabilities: { approval: true, terminal: true },
      },
      {
        id: 'deepseek-harness', type: 'deepseek-harness', name: 'DeepSeek Harness', model: 'deepseek',
        server: 'tokyo-01', workspace: '/srv/aht/dsh', session: 'dsh-gateway-001', status: 'waiting_input',
        current_task: '确认 dsh 插件状态', elapsed_seconds: 19, needs_user: true,
        maturity: 'developer_preview', capabilities: { approval: false, terminal: true },
      },
    ],
    sessions: [
      {
        id: 'codex-gateway-001', agent_id: 'codex', status: 'waiting_approval', title: '生产部署审批',
        started_at: '2026-08-18T02:59:00.000Z', updated_at: generatedAt,
      },
      {
        id: 'dsh-gateway-001', agent_id: 'deepseek-harness', status: 'waiting_input', title: '确认 dsh 插件状态',
        started_at: '2026-08-18T02:59:30.000Z', updated_at: generatedAt,
      },
    ],
    needs_you: [
      {
        id: 'codex-production-approval', agent_id: 'codex', type: 'approval',
        title: '确认部署到生产环境', detail: '该审批来自本地 reference Gateway。', risk: 'high',
        created_at: '2026-08-17T12:00:00.000Z', status: 'pending', actions: ['approve', 'reject', 'defer'],
      },
      {
        id: 'deepseek-harness-preview', agent_id: 'deepseek-harness', type: 'question',
        title: '确认 dsh 插件状态', detail: 'DeepSeek Harness Developer Preview 状态来自 Gateway。', risk: 'medium',
        created_at: '2026-08-17T12:01:00.000Z', status: 'pending', actions: ['defer'],
      },
    ],
    servers: [{
      id: 'tokyo-01', name: 'TOKYO-01', online: true, rtt_ms: 38, cpu_percent: 21,
      memory_percent: 46, disk_percent: 62, load: 0.42,
      services: { gateway: 'healthy', tailscale: 'healthy', ssh: 'healthy' }, agents: 2,
    }],
    network: { link: '4G', rtt_ms: 38, vpn: true },
  };
}
