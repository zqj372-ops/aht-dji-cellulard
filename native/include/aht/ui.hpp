#pragma once

#include "aht/model.hpp"

#include <cstddef>
#include <string>

namespace aht {

struct UiState {
    FixtureState data = makeFixtureState();
    Screen screen = Screen::Home;
    std::string selectedInboxId;
    std::size_t selectionIndex = 0;
    bool inputAvailable = true;
    bool glyphAtlasAvailable = true;
};

enum class Action {
    None,
    NavigateHome,
    NavigateNeeds,
    NavigateAgents,
    NavigateServers,
    NavigateTerminal,
    OpenSelected,
    Approve,
    Reject,
    Defer,
    Back,
    MoveUp,
    MoveDown,
    Quit,
};

bool applyAction(UiState& state, Action action);
Action parseAction(const std::string& token, Screen currentScreen);

} // namespace aht
