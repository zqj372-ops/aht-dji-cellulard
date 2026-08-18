#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace aht {

struct Color {
    std::uint8_t r = 0;
    std::uint8_t g = 0;
    std::uint8_t b = 0;
    std::uint8_t a = 255;
};

bool operator==(Color lhs, Color rhs);
bool operator!=(Color lhs, Color rhs);

class Surface {
public:
    virtual ~Surface() = default;

    virtual int width() const = 0;
    virtual int height() const = 0;
    virtual void clear(Color color) = 0;
    virtual void setPixel(int x, int y, Color color) = 0;
    virtual Color pixel(int x, int y) const = 0;
    virtual void present() = 0;
};

class MemorySurface final : public Surface {
public:
    MemorySurface(int width, int height);

    int width() const override;
    int height() const override;
    void clear(Color color) override;
    void setPixel(int x, int y, Color color) override;
    Color pixel(int x, int y) const override;
    void present() override;

private:
    int width_;
    int height_;
    std::vector<std::uint32_t> pixels_;
};

bool writePpm(const Surface& surface, const std::string& path, std::string& error);

class LinuxFramebufferSurface final : public Surface {
public:
    static std::unique_ptr<LinuxFramebufferSurface> open(const std::string& path, std::string& error);
    ~LinuxFramebufferSurface() override;

    int width() const override;
    int height() const override;
    void clear(Color color) override;
    void setPixel(int x, int y, Color color) override;
    Color pixel(int x, int y) const override;
    void present() override;

private:
    struct Impl;

    explicit LinuxFramebufferSurface(std::unique_ptr<Impl> impl);
    std::unique_ptr<Impl> impl_;
};

} // namespace aht
