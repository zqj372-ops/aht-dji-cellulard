#include "aht/framebuffer.hpp"
#include "aht/cjk_glyphs.hpp"
#include "aht/model.hpp"
#include "aht/renderer.hpp"
#include "aht/ui.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

namespace {

void require(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "renderer test failed: " << message << '\n';
        std::exit(1);
    }
}

} // namespace

int main() {
    require(aht::kCjkGlyphCount > 0, "embedded CJK atlas is non-empty");
    require(aht::kCjkGlyphWidth >= 32, "embedded font atlas is high resolution");
    const aht::CjkGlyph* latinC = aht::findCjkGlyph('C');
    const aht::CjkGlyph* latinO = aht::findCjkGlyph('o');
    require(latinC != nullptr && latinO != nullptr, "Latin UI glyphs are embedded");
    require(latinC->advance != latinO->advance, "Latin glyphs keep proportional advances");
    const std::string requiredChinese =
        "现在需要你事项等待确认部署到生产环境高风险插件状态待确认代码审查完成等待你的合并决策研究任务已完成可查看摘要需要你审批代理服务器终端风险批准拒绝稍后决策已本地模拟数据输入电量延迟内存磁盘负载网关";
    for (std::size_t index = 0; index < requiredChinese.size();) {
        const unsigned char first = static_cast<unsigned char>(requiredChinese[index]);
        std::uint32_t codePoint = first & 0x0FU;
        for (int offset = 1; offset < 3; ++offset) {
            const unsigned char next = static_cast<unsigned char>(requiredChinese[index + static_cast<std::size_t>(offset)]);
            codePoint = (codePoint << 6) | (next & 0x3FU);
        }
        require(aht::findCjkGlyph(codePoint) != nullptr, "every UI Chinese character has an embedded glyph");
        index += 3;
    }

    aht::MemorySurface glyphSurface(180, 64);
    aht::drawText(glyphSurface, 4, 4, "现在 Codex", aht::palette::ink, 2);
    int paintedPixels = 0;
    for (int y = 0; y < 64; ++y) {
        for (int x = 0; x < 64; ++x) {
            if (glyphSurface.pixel(x, y) != aht::Color{0, 0, 0, 255}) {
                ++paintedPixels;
            }
        }
    }
    require(paintedPixels > 20, "Chinese drawText paints glyph pixels");

    bool hasAntialiasedLatinPixel = false;
    for (int y = 4; y < 24 && !hasAntialiasedLatinPixel; ++y) {
        for (int x = 48; x < 150; ++x) {
            const aht::Color pixel = glyphSurface.pixel(x, y);
            if (pixel != aht::Color{0, 0, 0, 255} && pixel != aht::palette::ink) {
                hasAntialiasedLatinPixel = true;
                break;
            }
        }
    }
    require(hasAntialiasedLatinPixel, "Latin drawText uses antialiased font coverage");

    aht::MemorySurface surface(1024, 768);
    aht::UiState state;
    state.screen = aht::Screen::Home;
    aht::NativeRenderer renderer;

    renderer.render(surface, state);
    require(surface.pixel(0, 0) == aht::palette::screenBackground, "home starts with status bar background");
    require(surface.pixel(46, 36) == aht::palette::orange, "home draws connected status dot");
    require(surface.pixel(0, 60) == aht::palette::screenBackground, "home status bar uses screen background");
    require(surface.pixel(0, 80) == aht::palette::pageBackground, "home content starts with page background");
    bool foundPendingAccent = false;
    for (int y = 80; y < 160 && !foundPendingAccent; ++y) {
        for (int x = 860; x < 980; ++x) {
            if (surface.pixel(x, y) == aht::palette::orange) {
                foundPendingAccent = true;
                break;
            }
        }
    }
    require(foundPendingAccent, "home draws pending accent");
    require(surface.pixel(80, 230) == aht::palette::cardBackground, "home draws inbox card");
    require(surface.pixel(100, 220) == aht::Color{255, 255, 255, 255}, "home inbox card draws white agent icon tile");

    std::string error;
    require(aht::writePpm(surface, "/tmp/aht-native-home.ppm", error), "home PPM is written");
    require(error.empty(), "home PPM has no error");

    state.screen = aht::Screen::Approval;
    state.selectedInboxId = "codex-production-approval";
    require(aht::decideInboxItem(state.data, state.selectedInboxId, aht::Decision::Approve), "approve item for approval view");
    renderer.render(surface, state);
    require(surface.pixel(64, 116) == aht::palette::green, "approval shows approved accent");
    require(surface.pixel(80, 230) == aht::palette::cardBackground, "approval draws detail card");

    std::cout << "native renderer tests passed\n";
    return 0;
}
