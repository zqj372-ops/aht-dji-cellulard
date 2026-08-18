#include "aht/model.hpp"

#include <utility>

namespace aht {
namespace {

Agent makeAgent(
    std::string id,
    std::string type,
    std::string displayName,
    std::string shortName,
    std::string model,
    std::string workspace,
    std::string session,
    AgentStatus status,
    Availability availability,
    std::string project,
    std::string summary,
    std::string currentTask,
    int elapsed,
    bool needsUser,
    bool modelSwitch) {
    Agent agent;
    agent.id = std::move(id);
    agent.type = std::move(type);
    agent.displayName = std::move(displayName);
    agent.shortName = std::move(shortName);
    agent.model = std::move(model);
    agent.server = "tokyo-01";
    agent.workspace = std::move(workspace);
    agent.session = std::move(session);
    agent.status = status;
    agent.availability = availability;
    agent.project = std::move(project);
    agent.summary = std::move(summary);
    agent.currentTask = std::move(currentTask);
    agent.elapsed = elapsed;
    agent.needsUser = needsUser;
    agent.modelSwitch = modelSwitch;
    return agent;
}

InboxItem makeInbox(
    std::string id,
    std::string agentId,
    InboxKind kind,
    std::string title,
    std::string detail,
    RiskLevel risk,
    std::string timeLabel,
    bool canApprove,
    bool canReject) {
    InboxItem item;
    item.id = std::move(id);
    item.agentId = std::move(agentId);
    item.kind = kind;
    item.title = std::move(title);
    item.detail = std::move(detail);
    item.risk = risk;
    item.timeLabel = std::move(timeLabel);
    item.status = InboxStatus::Pending;
    item.canApprove = canApprove;
    item.canReject = canReject;
    item.canDefer = true;
    return item;
}

} // namespace

FixtureState makeFixtureState() {
    FixtureState state;
    state.dataSource = DataSource::Fixture;
    state.stale = false;

    state.agents = {
        makeAgent(
            "codex", "codex", "Codex", "codex", "codex", "/aht", "codex-001",
            AgentStatus::WaitingApproval, Availability::Beta, "AHT Client",
            "确认部署到生产环境", "生产部署审批", 184, true, false),
        makeAgent(
            "deepseek-harness", "deepseek-harness", "DeepSeek Harness", "dsh", "deepseek", "/aht/dsh", "dsh-001",
            AgentStatus::WaitingInput, Availability::DeveloperPreview, "dsh Web UI",
            "插件状态待确认", "确认 dsh 插件状态", 91, true, true),
        makeAgent(
            "claude-code", "claude-code", "Claude Code", "claude", "claude", "/aht", "claude-001",
            AgentStatus::Completed, Availability::Beta, "AHT Client",
            "代码审查完成", "", -1, false, false),
        makeAgent(
            "gemini-cli", "gemini-cli", "Gemini CLI", "gemini", "gemini", "/aht", "gemini-001",
            AgentStatus::Running, Availability::Beta, "AHT Client",
            "正在执行任务", "生成变更摘要", 312, false, true),
        makeAgent(
            "hermes-agent", "hermes-agent", "Hermes Agent", "hermes", "hermes", "/aht", "hermes-001",
            AgentStatus::WaitingInput, Availability::Beta, "AHT Client",
            "等待兼容性确认", "等待兼容性确认", 240, true, false),
        makeAgent(
            "openclaw", "openclaw", "OpenClaw", "openclaw", "openclaw", "/aht", "openclaw-001",
            AgentStatus::Completed, Availability::Beta, "AHT Client",
            "研究任务已完成", "", -1, false, true),
        makeAgent(
            "opencode", "opencode", "opencode", "opencode", "opencode", "/aht", "opencode-001",
            AgentStatus::Error, Availability::DeveloperPreview, "AHT Client",
            "任务需要重新运行", "重新运行失败任务", 36, true, false),
    };

    state.inbox = {
        makeInbox(
            "codex-production-approval", "codex", InboxKind::Approval,
            "确认部署到生产环境", "当前分支已经准备好，是否继续执行生产部署？",
            RiskLevel::High, "现在", true, true),
        makeInbox(
            "deepseek-harness-preview", "deepseek-harness", InboxKind::Question,
            "确认 dsh 插件状态", "DeepSeek Harness 处于开发者预览，是否继续显示该 Agent？",
            RiskLevel::Medium, "新", false, false),
        makeInbox(
            "claude-code-review", "claude-code", InboxKind::Completed,
            "代码审查完成", "Claude Code 已完成当前变更的审查摘要。",
            RiskLevel::Low, "2 分钟", false, false),
        makeInbox(
            "openclaw-research", "openclaw", InboxKind::Error,
            "研究任务需要查看", "OpenClaw 已完成研究，但有一项结果需要人工复核。",
            RiskLevel::Medium, "5 分钟", false, false),
    };

    state.servers = {
        ServerSnapshot{
            "tokyo-01", "TOKYO-01", "online", 42, 28, 46, 63, 0.72F,
            18, 1, "online", "online", "online", DataSource::Fixture,
        },
    };

    state.device = DeviceState{
        "4G", 46, true, 4, 82, 1024, 768, 60, 0, "gh7003",
    };
    return state;
}

std::size_t pendingCount(const FixtureState& state) {
    std::size_t count = 0;
    for (const InboxItem& item : state.inbox) {
        if (item.status == InboxStatus::Pending) {
            ++count;
        }
    }
    return count;
}

bool decideInboxItem(FixtureState& state, const std::string& itemId, Decision decision) {
    for (InboxItem& item : state.inbox) {
        if (item.id != itemId || item.status != InboxStatus::Pending) {
            continue;
        }
        switch (decision) {
        case Decision::Approve:
            item.status = InboxStatus::Approved;
            break;
        case Decision::Reject:
            item.status = InboxStatus::Rejected;
            break;
        case Decision::Defer:
            item.status = InboxStatus::Deferred;
            break;
        }
        return true;
    }
    return false;
}

const Agent* findAgent(const FixtureState& state, const std::string& agentId) {
    for (const Agent& agent : state.agents) {
        if (agent.id == agentId) {
            return &agent;
        }
    }
    return nullptr;
}

const InboxItem* findInboxItem(const FixtureState& state, const std::string& itemId) {
    for (const InboxItem& item : state.inbox) {
        if (item.id == itemId) {
            return &item;
        }
    }
    return nullptr;
}

const char* toString(AgentStatus status) {
    switch (status) {
    case AgentStatus::Idle: return "空闲";
    case AgentStatus::Running: return "运行中";
    case AgentStatus::WaitingInput: return "等待输入";
    case AgentStatus::WaitingApproval: return "等待批准";
    case AgentStatus::Completed: return "已完成";
    case AgentStatus::Error: return "错误";
    case AgentStatus::Disconnected: return "已断开";
    }
    return "unknown";
}

const char* toString(Availability availability) {
    switch (availability) {
    case Availability::Stable: return "稳定";
    case Availability::Beta: return "测试";
    case Availability::DeveloperPreview: return "开发者预览";
    case Availability::Generic: return "通用";
    case Availability::Unavailable: return "不可用";
    case Availability::Planned: return "计划中";
    }
    return "unknown";
}

const char* toString(InboxStatus status) {
    switch (status) {
    case InboxStatus::Pending: return "待处理";
    case InboxStatus::Approved: return "已批准";
    case InboxStatus::Rejected: return "已拒绝";
    case InboxStatus::Deferred: return "已稍后处理";
    }
    return "unknown";
}

const char* toString(RiskLevel risk) {
    switch (risk) {
    case RiskLevel::Low: return "低";
    case RiskLevel::Medium: return "中";
    case RiskLevel::High: return "高";
    }
    return "unknown";
}

} // namespace aht
