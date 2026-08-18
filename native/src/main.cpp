#include "aht/framebuffer.hpp"
#include "aht/input.hpp"
#include "aht/model.hpp"
#include "aht/renderer.hpp"
#include "aht/ui.hpp"

#include <csignal>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#if defined(__linux__)
#include <unistd.h>
#endif

namespace {

volatile std::sig_atomic_t stopRequested = 0;

void requestStop(int) {
    stopRequested = 1;
}

struct Options {
    bool headless = false;
    std::string actions;
    std::string screenshot;
    std::string framebuffer;
    std::string input;
    int frames = 0;
};

void printUsage() {
    std::cout << "Usage: aht-native [--headless] [--actions TOKENS] [--screenshot PATH]"
                 " [--framebuffer PATH] [--input PATH] [--frames N]\n";
}

bool readValue(int& index, int argc, char** argv, std::string& value) {
    if (index + 1 >= argc) {
        return false;
    }
    value = argv[++index];
    return true;
}

bool parseOptions(int argc, char** argv, Options& options) {
    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index];
        if (argument == "--headless") {
            options.headless = true;
        } else if (argument == "--actions") {
            if (!readValue(index, argc, argv, options.actions)) {
                return false;
            }
        } else if (argument == "--screenshot") {
            if (!readValue(index, argc, argv, options.screenshot)) {
                return false;
            }
        } else if (argument == "--framebuffer") {
            if (!readValue(index, argc, argv, options.framebuffer)) {
                return false;
            }
        } else if (argument == "--input") {
            if (!readValue(index, argc, argv, options.input)) {
                return false;
            }
        } else if (argument == "--frames") {
            std::string frameValue;
            if (!readValue(index, argc, argv, frameValue)) {
                return false;
            }
            try {
                options.frames = std::stoi(frameValue);
            } catch (...) {
                return false;
            }
        } else if (argument == "--help" || argument == "-h") {
            printUsage();
            std::exit(0);
        } else {
            return false;
        }
    }
    return true;
}

std::vector<std::string> splitActions(const std::string& raw) {
    std::vector<std::string> tokens;
    std::stringstream stream(raw);
    std::string token;
    while (std::getline(stream, token, ',')) {
        tokens.push_back(token);
    }
    return tokens;
}

const char* screenName(aht::Screen screen) {
    switch (screen) {
    case aht::Screen::Home: return "home";
    case aht::Screen::Needs: return "needs";
    case aht::Screen::Agents: return "agents";
    case aht::Screen::Servers: return "servers";
    case aht::Screen::Terminal: return "terminal";
    case aht::Screen::Approval: return "approval";
    }
    return "unknown";
}

void render(aht::Surface& surface, const aht::NativeRenderer& renderer, const aht::UiState& state) {
    renderer.render(surface, state);
}

void recordDecision(const aht::UiState& state, std::string& decision) {
    if (state.selectedInboxId.empty()) {
        return;
    }
    const aht::InboxItem* item = aht::findInboxItem(state.data, state.selectedInboxId);
    if (item != nullptr && item->status != aht::InboxStatus::Pending) {
        decision = aht::toString(item->status);
    }
}

bool applyAndRender(aht::UiState& state, aht::Action action, aht::Surface& surface, const aht::NativeRenderer& renderer, std::string& decision) {
    if (action == aht::Action::Quit) {
        return false;
    }
    if (aht::applyAction(state, action)) {
        recordDecision(state, decision);
        render(surface, renderer, state);
    }
    return true;
}

std::string environmentOr(const char* name, const std::string& fallback) {
    const char* value = std::getenv(name);
    return value == nullptr || *value == '\0' ? fallback : std::string(value);
}

} // namespace

int main(int argc, char** argv) {
    Options options;
    if (!parseOptions(argc, argv, options)) {
        printUsage();
        return 2;
    }

    std::signal(SIGTERM, requestStop);
    std::signal(SIGINT, requestStop);

    aht::UiState state;
    std::unique_ptr<aht::Surface> surface;
    if (options.headless) {
        surface = std::make_unique<aht::MemorySurface>(1024, 768);
        state.inputAvailable = true;
    } else {
        const std::string framebufferPath = options.framebuffer.empty()
            ? environmentOr("AHT_FRAMEBUFFER", "/dev/fb0")
            : options.framebuffer;
        std::string framebufferError;
        std::unique_ptr<aht::LinuxFramebufferSurface> framebuffer = aht::LinuxFramebufferSurface::open(framebufferPath, framebufferError);
        if (framebuffer == nullptr) {
            std::cerr << "AHT native framebuffer unavailable: " << framebufferError << '\n';
            return 1;
        }
        state.data.device.width = framebuffer->width();
        state.data.device.height = framebuffer->height();
        surface = std::move(framebuffer);
    }

    const aht::NativeRenderer renderer;
    std::string decision = "none";
    std::cout << "AHT native fixture\n";
    std::cout << "screen=" << screenName(state.screen) << " pending=" << aht::pendingCount(state.data) << '\n';
    render(*surface, renderer, state);

    if (options.headless) {
        if (!options.actions.empty()) {
            for (const std::string& token : splitActions(options.actions)) {
                const aht::Action action = aht::parseAction(token, state.screen);
                if (!applyAndRender(state, action, *surface, renderer, decision)) {
                    break;
                }
            }
        } else {
            aht::StdinInput input;
            aht::Action action = aht::Action::None;
            while (stopRequested == 0 && input.next(state.screen, action)) {
                if (!applyAndRender(state, action, *surface, renderer, decision)) {
                    break;
                }
            }
        }
    } else {
        const std::string requestedInput = options.input.empty()
            ? environmentOr("AHT_INPUT_DEVICE", "")
            : options.input;
        std::string inputError;
        std::unique_ptr<aht::EvdevInput> input = aht::EvdevInput::open(requestedInput, inputError);
        state.inputAvailable = input != nullptr && input->available();
        if (!state.inputAvailable) {
            std::cerr << "AHT native input unavailable: " << inputError << '\n';
        }
        render(*surface, renderer, state);
        int frames = 0;
        while (stopRequested == 0 && (options.frames <= 0 || frames < options.frames)) {
            if (input != nullptr) {
                aht::Action action = aht::Action::None;
                if (input->next(state.screen, action)) {
                    if (!applyAndRender(state, action, *surface, renderer, decision)) {
                        break;
                    }
                }
            }
#if defined(__linux__)
            ::usleep(33333);
#endif
            ++frames;
        }
    }

    if (!options.screenshot.empty()) {
        std::string screenshotError;
        if (!aht::writePpm(*surface, options.screenshot, screenshotError)) {
            std::cerr << screenshotError << '\n';
            return 1;
        }
    }

    std::cout << "screen=" << screenName(state.screen)
              << " pending=" << aht::pendingCount(state.data)
              << " decision=" << decision << '\n';
    return 0;
}
