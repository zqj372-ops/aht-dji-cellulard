#include "aht/ui.hpp"

#include <algorithm>
#include <cctype>
#include <string>

namespace aht {
namespace {

bool setScreen(UiState& state, Screen screen) {
    if (state.screen == screen) {
        return false;
    }
    state.screen = screen;
    state.selectionIndex = 0;
    return true;
}

const InboxItem* pendingAt(const FixtureState& data, std::size_t requestedIndex) {
    std::size_t index = 0;
    for (const InboxItem& item : data.inbox) {
        if (item.status != InboxStatus::Pending) {
            continue;
        }
        if (index == requestedIndex) {
            return &item;
        }
        ++index;
    }
    return nullptr;
}

InboxItem* mutableInbox(FixtureState& data, const std::string& itemId) {
    for (InboxItem& item : data.inbox) {
        if (item.id == itemId) {
            return &item;
        }
    }
    return nullptr;
}

std::string normalize(std::string token) {
    std::string normalized;
    normalized.reserve(token.size());
    for (const unsigned char character : token) {
        if (!std::isspace(character)) {
            normalized.push_back(static_cast<char>(std::tolower(character)));
        }
    }
    return normalized;
}

} // namespace

bool applyAction(UiState& state, Action action) {
    switch (action) {
    case Action::None:
    case Action::Quit:
        return false;
    case Action::NavigateHome:
        return setScreen(state, Screen::Home);
    case Action::NavigateNeeds:
        return setScreen(state, Screen::Needs);
    case Action::NavigateAgents:
        return setScreen(state, Screen::Agents);
    case Action::NavigateServers:
        return setScreen(state, Screen::Servers);
    case Action::NavigateTerminal:
        return setScreen(state, Screen::Terminal);
    case Action::OpenSelected: {
        if (state.screen != Screen::Home && state.screen != Screen::Needs) {
            return false;
        }
        const InboxItem* item = pendingAt(state.data, state.selectionIndex);
        if (item == nullptr) {
            return false;
        }
        state.selectedInboxId = item->id;
        setScreen(state, Screen::Approval);
        return true;
    }
    case Action::Approve:
    case Action::Reject:
    case Action::Defer: {
        if (state.screen != Screen::Approval || state.selectedInboxId.empty()) {
            return false;
        }
        InboxItem* item = mutableInbox(state.data, state.selectedInboxId);
        if (item == nullptr || item->status != InboxStatus::Pending) {
            return false;
        }
        Decision decision = Decision::Defer;
        if (action == Action::Approve) {
            if (!item->canApprove) {
                return false;
            }
            decision = Decision::Approve;
        } else if (action == Action::Reject) {
            if (!item->canReject) {
                return false;
            }
            decision = Decision::Reject;
        }
        return decideInboxItem(state.data, state.selectedInboxId, decision);
    }
    case Action::Back:
        if (state.screen == Screen::Approval) {
            return setScreen(state, Screen::Needs);
        }
        return setScreen(state, Screen::Home);
    case Action::MoveUp:
        if (state.screen != Screen::Needs && state.screen != Screen::Home) {
            return false;
        }
        if (state.selectionIndex == 0) {
            return false;
        }
        --state.selectionIndex;
        return true;
    case Action::MoveDown: {
        if (state.screen != Screen::Needs && state.screen != Screen::Home) {
            return false;
        }
        const std::size_t count = pendingCount(state.data);
        if (count == 0 || state.selectionIndex + 1 >= count) {
            return false;
        }
        ++state.selectionIndex;
        return true;
    }
    }
    return false;
}

Action parseAction(const std::string& token, Screen currentScreen) {
    const std::string normalized = normalize(token);
    if (normalized == "quit" || normalized == "q") {
        return Action::Quit;
    }
    if (normalized == "h") {
        return Action::NavigateHome;
    }
    if (normalized == "n") {
        return Action::NavigateNeeds;
    }
    if (normalized == "a") {
        return currentScreen == Screen::Approval ? Action::Approve : Action::NavigateAgents;
    }
    if (normalized == "s") {
        return Action::NavigateServers;
    }
    if (normalized == "t") {
        return Action::NavigateTerminal;
    }
    if (normalized == "x") {
        return currentScreen == Screen::Approval ? Action::Reject : Action::None;
    }
    if (normalized == "b" || normalized == "esc" || normalized == "back") {
        return Action::Back;
    }
    if (normalized == "defer" || normalized == "d") {
        return currentScreen == Screen::Approval ? Action::Defer : Action::None;
    }
    if (normalized == "left") {
        return Action::Back;
    }
    if (normalized == "right") {
        return (currentScreen == Screen::Home || currentScreen == Screen::Needs) ? Action::OpenSelected : Action::None;
    }
    if (normalized == "enter" || normalized == "return" || normalized == "space") {
        return (currentScreen == Screen::Home || currentScreen == Screen::Needs) ? Action::OpenSelected : Action::None;
    }
    if (normalized == "up") {
        return Action::MoveUp;
    }
    if (normalized == "down") {
        return Action::MoveDown;
    }
    return Action::None;
}

} // namespace aht
