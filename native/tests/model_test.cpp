#include "aht/model.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

namespace {

void require(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "model test failed: " << message << '\n';
        std::exit(1);
    }
}

} // namespace

int main() {
    const aht::FixtureState fixture = aht::makeFixtureState();

    require(fixture.agents.size() == 7, "fixture has seven agents");
    require(fixture.inbox.size() == 4, "fixture has four inbox items");
    require(fixture.servers.size() == 1, "fixture has one server");
    require(aht::pendingCount(fixture) == 4, "all inbox items start pending");
    require(fixture.agents.front().id == "codex", "first agent id is codex");
    require(fixture.inbox.front().id == "codex-production-approval", "first inbox id matches browser fixture");
    require(fixture.servers.front().displayName == "TOKYO-01", "server name matches browser fixture");
    require(fixture.device.link == "4G", "network link matches browser fixture");
    require(fixture.device.rtt == 46, "network RTT matches browser fixture");
    require(fixture.device.vpn, "VPN is enabled in fixture");
    require(fixture.device.battery == 82, "battery matches browser fixture");
    require(fixture.device.width == 1024 && fixture.device.height == 768, "display dimensions match browser fixture");
    require(fixture.device.refreshRate == 60 && fixture.device.panel == "gh7003", "display metadata matches browser fixture");

    aht::FixtureState changed = fixture;
    require(aht::decideInboxItem(changed, "codex-production-approval", aht::Decision::Approve), "approve existing item");
    require(changed.inbox.front().status == aht::InboxStatus::Approved, "approved status is recorded");
    require(aht::pendingCount(changed) == 3, "approved item leaves pending count");
    require(changed.inbox[1].status == aht::InboxStatus::Pending, "other inbox item remains pending");

    require(aht::decideInboxItem(changed, "deepseek-harness-preview", aht::Decision::Reject), "reject existing item");
    require(changed.inbox[1].status == aht::InboxStatus::Rejected, "rejected status is recorded");
    require(aht::decideInboxItem(changed, "claude-code-review", aht::Decision::Defer), "defer existing item");
    require(changed.inbox[2].status == aht::InboxStatus::Deferred, "deferred status is recorded");
    require(!aht::decideInboxItem(changed, "not-an-item", aht::Decision::Approve), "unknown item is rejected safely");
    require(aht::pendingCount(changed) == 1, "three decisions leave one pending item");

    require(aht::findAgent(fixture, "openclaw") != nullptr, "find agent by id");
    require(aht::findInboxItem(fixture, "openclaw-research") != nullptr, "find inbox by id");
    require(aht::findAgent(fixture, "missing") == nullptr, "missing agent is absent");

    std::cout << "native model tests passed\n";
    return 0;
}
