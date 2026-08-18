#include "aht/input.hpp"

#include <cerrno>
#include <cstring>
#include <iostream>
#include <string>

#if defined(__linux__)
#include <fcntl.h>
#include <linux/input.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

namespace aht {

#if defined(__linux__)
namespace {

bool testBit(const unsigned long* bits, unsigned int code) {
    const unsigned int word = code / (sizeof(unsigned long) * 8);
    const unsigned int offset = code % (sizeof(unsigned long) * 8);
    return (bits[word] >> offset) & 1UL;
}

bool isGamepadDevice(int fd) {
    char name[256] = {};
    if (::ioctl(fd, EVIOCGNAME(sizeof(name) - 1), name) >= 0) {
        const std::string deviceName(name);
        if (deviceName.find("TRIMUI") != std::string::npos ||
            deviceName.find("Gamepad") != std::string::npos ||
            deviceName.find("Controller") != std::string::npos) {
            return true;
        }
    }

    unsigned long keyBits[KEY_MAX / (sizeof(unsigned long) * 8) + 2] = {};
    if (::ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keyBits)), keyBits) >= 0) {
        if (testBit(keyBits, BTN_A) && testBit(keyBits, BTN_B) && testBit(keyBits, BTN_X)) {
            return true;
        }
    }
    return false;
}

} // namespace
#endif

bool StdinInput::next(Screen currentScreen, Action& action) {
    std::string token;
    if (!std::getline(std::cin, token)) {
        action = Action::Quit;
        return true;
    }
    action = parseAction(token, currentScreen);
    return action != Action::None;
}

EvdevInput::~EvdevInput() {
#if defined(__linux__)
    if (fd_ >= 0) {
        ::close(fd_);
    }
#else
    (void)fd_;
#endif
}

std::unique_ptr<EvdevInput> EvdevInput::open(const std::string& requestedPath, std::string& error) {
    auto input = std::unique_ptr<EvdevInput>(new EvdevInput());
#if defined(__linux__)
    std::string path = requestedPath;
    if (path.empty()) {
        int fallbackFd = -1;
        std::string fallbackPath;
        for (int index = 0; index < 64; ++index) {
            const std::string candidate = "/dev/input/event" + std::to_string(index);
            const int fd = ::open(candidate.c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
            if (fd < 0) {
                continue;
            }
            if (fallbackFd < 0) {
                fallbackFd = fd;
                fallbackPath = candidate;
            }
            if (isGamepadDevice(fd)) {
                if (fallbackFd >= 0 && fallbackFd != fd) {
                    ::close(fallbackFd);
                }
                input->fd_ = fd;
                input->path_ = candidate;
                input->available_ = true;
                error.clear();
                return input;
            }
            ::close(fd);
        }
        if (fallbackFd >= 0) {
            input->fd_ = fallbackFd;
            input->path_ = fallbackPath;
            input->available_ = true;
            error.clear();
            return input;
        }
        error = "no readable /dev/input/event* device";
        return input;
    }

    input->fd_ = ::open(path.c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (input->fd_ < 0) {
        error = "open input " + path + ": " + std::strerror(errno);
        return input;
    }
    input->path_ = path;
    input->available_ = true;
    error.clear();
    return input;
#else
    (void)requestedPath;
    error = "evdev input is only available on Linux";
    return input;
#endif
}

bool EvdevInput::available() const {
    return available_;
}

const std::string& EvdevInput::path() const {
    return path_;
}

bool EvdevInput::next(Screen currentScreen, Action& action) {
    action = Action::None;
#if defined(__linux__)
    if (!available_ || fd_ < 0) {
        return false;
    }
    input_event event{};
    const ssize_t result = ::read(fd_, &event, sizeof(event));
    if (result == 0) {
        available_ = false;
        return false;
    }
    if (result < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) {
            return false;
        }
        available_ = false;
        return false;
    }
    if (static_cast<std::size_t>(result) != sizeof(event)) {
        return false;
    }
    if (event.type == EV_ABS) {
        switch (event.code) {
        case ABS_HAT0Y:
            if (event.value == -1) {
                action = Action::MoveUp;
            } else if (event.value == 1) {
                action = Action::MoveDown;
            }
            break;
        case ABS_HAT0X:
            if (event.value == -1) {
                action = Action::Back;
            } else if (event.value == 1) {
                action = Action::OpenSelected;
            }
            break;
        default:
            break;
        }
        return action != Action::None;
    }
    if (event.type != EV_KEY || (event.value != 1 && event.value != 2)) {
        return false;
    }
    switch (event.code) {
    case KEY_UP: action = Action::MoveUp; break;
    case KEY_DOWN: action = Action::MoveDown; break;
    case KEY_LEFT: action = Action::Back; break;
    case KEY_RIGHT: action = Action::OpenSelected; break;
    case KEY_ENTER: action = parseAction("enter", currentScreen); break;
    case KEY_SPACE: action = parseAction("space", currentScreen); break;
    case KEY_ESC: action = Action::Back; break;
    case KEY_A: action = parseAction("a", currentScreen); break;
    case KEY_B: action = Action::Back; break;
    case KEY_X: action = parseAction("x", currentScreen); break;
    case KEY_H: action = Action::NavigateHome; break;
    case KEY_N: action = Action::NavigateNeeds; break;
    case KEY_S: action = Action::NavigateServers; break;
    case KEY_T: action = Action::NavigateTerminal; break;
    case KEY_V: action = parseAction("defer", currentScreen); break;
    case BTN_A:
        action = currentScreen == Screen::Approval ? Action::Approve : Action::OpenSelected;
        break;
    case BTN_B:
        action = Action::Back;
        break;
    case BTN_X:
        action = currentScreen == Screen::Approval ? Action::Reject : Action::None;
        break;
    case BTN_Y:
        action = Action::NavigateAgents;
        break;
    case BTN_START:
        action = Action::Quit;
        break;
    case BTN_SELECT:
        action = Action::NavigateHome;
        break;
    default: return false;
    }
    return action != Action::None;
#else
    (void)currentScreen;
    return false;
#endif
}

} // namespace aht
