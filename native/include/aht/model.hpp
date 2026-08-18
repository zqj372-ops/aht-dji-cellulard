#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace aht {

enum class AgentStatus {
    Idle,
    Running,
    WaitingInput,
    WaitingApproval,
    Completed,
    Error,
    Disconnected,
};

enum class Availability {
    Stable,
    Beta,
    DeveloperPreview,
    Generic,
    Unavailable,
    Planned,
};

enum class InboxKind {
    Approval,
    Question,
    Completed,
    Error,
    Security,
    ServerAlert,
};

enum class RiskLevel {
    Low,
    Medium,
    High,
};

enum class InboxStatus {
    Pending,
    Approved,
    Rejected,
    Deferred,
};

enum class Decision {
    Approve,
    Reject,
    Defer,
};

enum class Screen {
    Home,
    Needs,
    Agents,
    Servers,
    Terminal,
    Approval,
};

enum class DataSource {
    Fixture,
    GatewayUnavailable,
};

struct Agent {
    std::string id;
    std::string type;
    std::string displayName;
    std::string shortName;
    std::string model;
    std::string server;
    std::string workspace;
    std::string session;
    AgentStatus status = AgentStatus::Idle;
    Availability availability = Availability::Unavailable;
    std::string project;
    std::string summary;
    std::string currentTask;
    int elapsed = -1;
    bool needsUser = false;
    bool modelSwitch = false;
};

struct InboxItem {
    std::string id;
    std::string agentId;
    InboxKind kind = InboxKind::Question;
    std::string title;
    std::string detail;
    RiskLevel risk = RiskLevel::Low;
    std::string timeLabel;
    InboxStatus status = InboxStatus::Pending;
    bool canApprove = false;
    bool canReject = false;
    bool canDefer = true;
};

struct ServerSnapshot {
    std::string id;
    std::string displayName;
    std::string status;
    int rtt = 0;
    int cpu = 0;
    int ram = 0;
    int disk = 0;
    float load = 0.0F;
    int dockerRunning = 0;
    int dockerRestarting = 0;
    std::string gateway;
    std::string tailscale;
    std::string ssh;
    DataSource dataSource = DataSource::Fixture;
};

struct DeviceState {
    std::string link;
    int rtt = 0;
    bool vpn = false;
    int signal = 0;
    int battery = 0;
    int width = 1024;
    int height = 768;
    int refreshRate = 60;
    int rotation = 0;
    std::string panel;
};

struct FixtureState {
    std::vector<Agent> agents;
    std::vector<InboxItem> inbox;
    std::vector<ServerSnapshot> servers;
    DeviceState device;
    DataSource dataSource = DataSource::Fixture;
    bool stale = false;
};

FixtureState makeFixtureState();
std::size_t pendingCount(const FixtureState& state);
bool decideInboxItem(FixtureState& state, const std::string& itemId, Decision decision);

const Agent* findAgent(const FixtureState& state, const std::string& agentId);
const InboxItem* findInboxItem(const FixtureState& state, const std::string& itemId);

const char* toString(AgentStatus status);
const char* toString(Availability availability);
const char* toString(InboxStatus status);
const char* toString(RiskLevel risk);

} // namespace aht
