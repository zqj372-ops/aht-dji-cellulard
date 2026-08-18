#pragma once

#include "aht/ui.hpp"

#include <memory>
#include <string>

namespace aht {

class StdinInput {
public:
    bool next(Screen currentScreen, Action& action);
};

class EvdevInput {
public:
    static std::unique_ptr<EvdevInput> open(const std::string& requestedPath, std::string& error);
    ~EvdevInput();

    bool available() const;
    const std::string& path() const;
    bool next(Screen currentScreen, Action& action);

private:
    EvdevInput() = default;

    int fd_ = -1;
    bool available_ = false;
    std::string path_;
};

} // namespace aht
