#pragma once

#include "aht/framebuffer.hpp"
#include "aht/ui.hpp"

#include <string>

namespace aht {

namespace palette {
constexpr Color pageBackground{8, 10, 15, 255};
constexpr Color screenBackground{10, 15, 22, 255};
constexpr Color cardBackground{26, 33, 43, 255};
constexpr Color cardStrong{34, 43, 55, 255};
constexpr Color iconTile{255, 255, 255, 255};
constexpr Color ink{238, 244, 245, 255};
constexpr Color muted{148, 163, 170, 255};
constexpr Color line{58, 69, 80, 255};
constexpr Color orange{255, 154, 61, 255};
constexpr Color green{102, 214, 154, 255};
constexpr Color blue{141, 181, 255, 255};
constexpr Color red{255, 111, 114, 255};
constexpr Color purple{184, 166, 255, 255};
} // namespace palette

void fillRect(Surface& surface, int x, int y, int width, int height, Color color);
void strokeRect(Surface& surface, int x, int y, int width, int height, Color color);
void drawLine(Surface& surface, int x0, int y0, int x1, int y1, Color color);
void drawText(Surface& surface, int x, int y, const std::string& text, Color color, int scale = 2);
void drawBadge(Surface& surface, int x, int y, const std::string& text, Color color);

class NativeRenderer {
public:
    NativeRenderer(int logicalWidth = 1024, int logicalHeight = 768);

    void render(Surface& surface, const UiState& state) const;

private:
    int logicalWidth_;
    int logicalHeight_;
};

} // namespace aht
