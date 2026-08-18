#include "aht/framebuffer.hpp"

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <fstream>
#include <limits>

#if defined(__linux__)
#include <fcntl.h>
#include <linux/fb.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#endif

namespace aht {

bool operator==(Color lhs, Color rhs) {
    return lhs.r == rhs.r && lhs.g == rhs.g && lhs.b == rhs.b && lhs.a == rhs.a;
}

bool operator!=(Color lhs, Color rhs) {
    return !(lhs == rhs);
}

namespace {

std::uint32_t packColor(Color color) {
    return (static_cast<std::uint32_t>(color.r) << 24U)
        | (static_cast<std::uint32_t>(color.g) << 16U)
        | (static_cast<std::uint32_t>(color.b) << 8U)
        | static_cast<std::uint32_t>(color.a);
}

Color unpackColor(std::uint32_t value) {
    return Color{
        static_cast<std::uint8_t>((value >> 24U) & 0xffU),
        static_cast<std::uint8_t>((value >> 16U) & 0xffU),
        static_cast<std::uint8_t>((value >> 8U) & 0xffU),
        static_cast<std::uint8_t>(value & 0xffU),
    };
}

std::uint32_t channelMask(unsigned length) {
    if (length == 0U) {
        return 0U;
    }
    if (length >= 32U) {
        return std::numeric_limits<std::uint32_t>::max();
    }
    return (static_cast<std::uint32_t>(1U) << length) - 1U;
}

std::uint32_t encodeChannel(std::uint8_t value, unsigned length) {
    const std::uint32_t mask = channelMask(length);
    return (static_cast<std::uint32_t>(value) * mask + 127U) / 255U;
}

std::uint8_t decodeChannel(std::uint32_t value, unsigned length) {
    const std::uint32_t mask = channelMask(length);
    if (mask == 0U) {
        return 0;
    }
    return static_cast<std::uint8_t>((value * 255U + mask / 2U) / mask);
}

} // namespace

MemorySurface::MemorySurface(int width, int height)
    : width_(std::max(width, 0)), height_(std::max(height, 0)),
      pixels_(static_cast<std::size_t>(width_) * static_cast<std::size_t>(height_), packColor(Color{})) {}

int MemorySurface::width() const {
    return width_;
}

int MemorySurface::height() const {
    return height_;
}

void MemorySurface::clear(Color color) {
    std::fill(pixels_.begin(), pixels_.end(), packColor(color));
}

void MemorySurface::setPixel(int x, int y, Color color) {
    if (x < 0 || y < 0 || x >= width_ || y >= height_) {
        return;
    }
    pixels_[static_cast<std::size_t>(y) * static_cast<std::size_t>(width_) + static_cast<std::size_t>(x)] = packColor(color);
}

Color MemorySurface::pixel(int x, int y) const {
    if (x < 0 || y < 0 || x >= width_ || y >= height_) {
        return Color{};
    }
    return unpackColor(pixels_[static_cast<std::size_t>(y) * static_cast<std::size_t>(width_) + static_cast<std::size_t>(x)]);
}

void MemorySurface::present() {}

bool writePpm(const Surface& surface, const std::string& path, std::string& error) {
    std::ofstream output(path, std::ios::binary);
    if (!output) {
        error = "cannot open PPM output: " + path;
        return false;
    }
    output << "P6\n" << surface.width() << ' ' << surface.height() << "\n255\n";
    for (int y = 0; y < surface.height(); ++y) {
        for (int x = 0; x < surface.width(); ++x) {
            const Color color = surface.pixel(x, y);
            const char rgb[3] = {
                static_cast<char>(color.r),
                static_cast<char>(color.g),
                static_cast<char>(color.b),
            };
            output.write(rgb, sizeof(rgb));
        }
    }
    if (!output) {
        error = "cannot write PPM output: " + path;
        return false;
    }
    error.clear();
    return true;
}

struct LinuxFramebufferSurface::Impl {
    int fd = -1;
    void* mapping = nullptr;
    std::size_t mappingLength = 0;
    int width = 0;
    int height = 0;
    int bitsPerPixel = 0;
    int lineLength = 0;
    std::size_t bufferOffset = 0;
    unsigned redOffset = 0;
    unsigned redLength = 0;
    unsigned greenOffset = 0;
    unsigned greenLength = 0;
    unsigned blueOffset = 0;
    unsigned blueLength = 0;
    unsigned alphaOffset = 0;
    unsigned alphaLength = 0;

    ~Impl() {
#if defined(__linux__)
        if (mapping != nullptr && mapping != MAP_FAILED) {
            ::munmap(mapping, mappingLength);
        }
        if (fd >= 0) {
            ::close(fd);
        }
#endif
    }
};

LinuxFramebufferSurface::LinuxFramebufferSurface(std::unique_ptr<Impl> impl)
    : impl_(std::move(impl)) {}

LinuxFramebufferSurface::~LinuxFramebufferSurface() = default;

std::unique_ptr<LinuxFramebufferSurface> LinuxFramebufferSurface::open(const std::string& path, std::string& error) {
#if defined(__linux__)
    auto impl = std::make_unique<Impl>();
    impl->fd = ::open(path.c_str(), O_RDWR | O_CLOEXEC);
    if (impl->fd < 0) {
        error = "open framebuffer " + path + ": " + std::strerror(errno);
        return nullptr;
    }

    fb_var_screeninfo variable{};
    fb_fix_screeninfo fixed{};
    if (::ioctl(impl->fd, FBIOGET_VSCREENINFO, &variable) < 0) {
        error = "FBIOGET_VSCREENINFO: " + std::string(std::strerror(errno));
        return nullptr;
    }
    if (::ioctl(impl->fd, FBIOGET_FSCREENINFO, &fixed) < 0) {
        error = "FBIOGET_FSCREENINFO: " + std::string(std::strerror(errno));
        return nullptr;
    }
    if ((variable.bits_per_pixel != 16U && variable.bits_per_pixel != 32U)
        || variable.xres == 0U || variable.yres == 0U || fixed.line_length <= 0) {
        error = "unsupported framebuffer format or dimensions";
        return nullptr;
    }

    const std::size_t frameLength = static_cast<std::size_t>(fixed.line_length) * static_cast<std::size_t>(variable.yres);
    impl->bufferOffset = static_cast<std::size_t>(variable.yoffset) * static_cast<std::size_t>(fixed.line_length);
    const std::size_t requiredLength = impl->bufferOffset + frameLength;
    if (fixed.smem_len < requiredLength) {
        error = "framebuffer mapping is smaller than the active display page";
        return nullptr;
    }
    impl->mappingLength = fixed.smem_len;
    impl->mapping = ::mmap(nullptr, impl->mappingLength, PROT_READ | PROT_WRITE, MAP_SHARED, impl->fd, 0);
    if (impl->mapping == MAP_FAILED) {
        error = "mmap framebuffer: " + std::string(std::strerror(errno));
        impl->mapping = nullptr;
        return nullptr;
    }

    impl->width = static_cast<int>(variable.xres);
    impl->height = static_cast<int>(variable.yres);
    impl->bitsPerPixel = static_cast<int>(variable.bits_per_pixel);
    impl->lineLength = fixed.line_length;
    impl->redOffset = variable.red.offset;
    impl->redLength = variable.red.length;
    impl->greenOffset = variable.green.offset;
    impl->greenLength = variable.green.length;
    impl->blueOffset = variable.blue.offset;
    impl->blueLength = variable.blue.length;
    impl->alphaOffset = variable.transp.offset;
    impl->alphaLength = variable.transp.length;
    error.clear();
    return std::unique_ptr<LinuxFramebufferSurface>(new LinuxFramebufferSurface(std::move(impl)));
#else
    (void)path;
    error = "Linux framebuffer is only available on Linux";
    return nullptr;
#endif
}

int LinuxFramebufferSurface::width() const {
    return impl_ == nullptr ? 0 : impl_->width;
}

int LinuxFramebufferSurface::height() const {
    return impl_ == nullptr ? 0 : impl_->height;
}

void LinuxFramebufferSurface::clear(Color color) {
    if (impl_ == nullptr) {
        return;
    }
    for (int y = 0; y < impl_->height; ++y) {
        for (int x = 0; x < impl_->width; ++x) {
            setPixel(x, y, color);
        }
    }
}

void LinuxFramebufferSurface::setPixel(int x, int y, Color color) {
    if (impl_ == nullptr || impl_->mapping == nullptr || x < 0 || y < 0 || x >= impl_->width || y >= impl_->height) {
        return;
    }
    auto* row = static_cast<std::uint8_t*>(impl_->mapping) + impl_->bufferOffset
        + static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->lineLength);
    const std::uint32_t value = (encodeChannel(color.r, impl_->redLength) << impl_->redOffset)
        | (encodeChannel(color.g, impl_->greenLength) << impl_->greenOffset)
        | (encodeChannel(color.b, impl_->blueLength) << impl_->blueOffset)
        | (encodeChannel(color.a, impl_->alphaLength) << impl_->alphaOffset);
    if (impl_->bitsPerPixel == 32) {
        std::memcpy(row + static_cast<std::size_t>(x) * 4U, &value, sizeof(value));
    } else {
        const std::uint16_t rgb565 = static_cast<std::uint16_t>(value & 0xffffU);
        std::memcpy(row + static_cast<std::size_t>(x) * 2U, &rgb565, sizeof(rgb565));
    }
}

Color LinuxFramebufferSurface::pixel(int x, int y) const {
    if (impl_ == nullptr || impl_->mapping == nullptr || x < 0 || y < 0 || x >= impl_->width || y >= impl_->height) {
        return Color{};
    }
    const auto* row = static_cast<const std::uint8_t*>(impl_->mapping) + impl_->bufferOffset
        + static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->lineLength);
    std::uint32_t value = 0;
    if (impl_->bitsPerPixel == 32) {
        std::memcpy(&value, row + static_cast<std::size_t>(x) * 4U, sizeof(value));
    } else {
        std::uint16_t rgb565 = 0;
        std::memcpy(&rgb565, row + static_cast<std::size_t>(x) * 2U, sizeof(rgb565));
        value = rgb565;
    }
    return Color{
        decodeChannel(value >> impl_->redOffset, impl_->redLength),
        decodeChannel(value >> impl_->greenOffset, impl_->greenLength),
        decodeChannel(value >> impl_->blueOffset, impl_->blueLength),
        static_cast<std::uint8_t>(impl_->alphaLength == 0U ? 255 : decodeChannel(value >> impl_->alphaOffset, impl_->alphaLength)),
    };
}

void LinuxFramebufferSurface::present() {}

} // namespace aht
