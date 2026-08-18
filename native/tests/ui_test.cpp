#include "aht/model.hpp"
#include "aht/ui.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

namespace {

void require(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "ui test failed: " << message << '\n';
        std::exit(1);
    }
}

} // namespace

int main() {
    aht::UiState state;
    require(state.screen == aht::Screen::Home, "state starts at home");
    require(aht::applyAction(state, aht::Action::NavigateNeeds), "navigate to needs");
    require(state.screen == aht::Screen::Needs, "needs page is selected");
    require(aht::applyAction(state, aht::Action::OpenSelected), "open first pending item");
    require(state.screen == aht::Screen::Approval, "approval page is selected");
    require(state.selectedInboxId == "codex-production-approval", "first pending item is selected");
    require(aht::applyAction(state, aht::Action::Reject), "reject selected item");
    require(state.data.inbox.front().status == aht::InboxStatus::Rejected, "selected item is rejected");
    require(state.data.inbox[1].status == aht::InboxStatus::Pending, "other item stays pending");
    require(aht::pendingCount(state.data) == 3, "pending count follows decision");
    require(aht::applyAction(state, aht::Action::Back), "back returns to needs");
    require(state.screen == aht::Screen::Needs, "back returns to needs page");

    require(aht::applyAction(state, aht::Action::NavigateAgents), "navigate to agents");
    require(state.screen == aht::Screen::Agents, "agents page is selected");
    require(aht::applyAction(state, aht::Action::NavigateServers), "navigate to servers");
    require(state.screen == aht::Screen::Servers, "servers page is selected");
    require(aht::applyAction(state, aht::Action::NavigateTerminal), "navigate to terminal");
    require(state.screen == aht::Screen::Terminal, "terminal page is selected");
    require(aht::applyAction(state, aht::Action::NavigateHome), "navigate home");
    require(state.screen == aht::Screen::Home, "home page is selected");

    require(aht::parseAction("enter", aht::Screen::Needs) == aht::Action::OpenSelected, "enter opens needs item");
    require(aht::parseAction("a", aht::Screen::Approval) == aht::Action::Approve, "a approves in approval page");
    require(aht::parseAction("a", aht::Screen::Home) == aht::Action::NavigateAgents, "a navigates to agents elsewhere");
    require(aht::parseAction("x", aht::Screen::Home) == aht::Action::None, "x is not a hidden global mutation");
    require(aht::parseAction("left", aht::Screen::Needs) == aht::Action::Back, "left maps to back");
    require(aht::parseAction("right", aht::Screen::Needs) == aht::Action::OpenSelected, "right opens needs item");

    aht::UiState empty;
    empty.data.inbox.clear();
    empty.screen = aht::Screen::Approval;
    require(!aht::applyAction(empty, aht::Action::Approve), "approval without selected item is ignored");
    require(empty.screen == aht::Screen::Approval, "ignored approval leaves page unchanged");

    std::cout << "native ui tests passed\n";
    return 0;
}
