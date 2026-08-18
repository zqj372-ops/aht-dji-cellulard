#include "aht/renderer.hpp"
#include "aht/cjk_glyphs.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <utility>

namespace aht {
namespace {

void drawUnsupportedGlyph(Surface& surface, int x, int y, Color color, int scale) {
    strokeRect(surface, x, y, 5 * scale, 7 * scale, color);
}

struct Utf8CodePoint {
    std::uint32_t code = 0;
    int bytes = 0;
};

Utf8CodePoint decodeUtf8(const std::string& text, std::size_t index) {
    const unsigned char first = static_cast<unsigned char>(text[index]);
    Utf8CodePoint result;
    if ((first & 0xE0U) == 0xC0U) {
        result.code = first & 0x1FU;
        result.bytes = 2;
    } else if ((first & 0xF0U) == 0xE0U) {
        result.code = first & 0x0FU;
        result.bytes = 3;
    } else if ((first & 0xF8U) == 0xF0U) {
        result.code = first & 0x07U;
        result.bytes = 4;
    } else {
        result.bytes = 1;
        return result;
    }
    for (int offset = 1; offset < result.bytes; ++offset) {
        if (index + static_cast<std::size_t>(offset) >= text.size()) {
            result.bytes = 1;
            result.code = 0;
            return result;
        }
        const unsigned char next = static_cast<unsigned char>(text[index + static_cast<std::size_t>(offset)]);
        if ((next & 0xC0U) != 0x80U) {
            result.bytes = 1;
            result.code = 0;
            return result;
        }
        result.code = (result.code << 6) | (next & 0x3FU);
    }
    return result;
}

Color blendGlyphPixel(Color background, Color foreground, std::uint8_t coverage) {
    const unsigned alpha = coverage;
    const unsigned inverse = 255U - alpha;
    return Color{
        static_cast<std::uint8_t>((static_cast<unsigned>(foreground.r) * alpha + static_cast<unsigned>(background.r) * inverse) / 255U),
        static_cast<std::uint8_t>((static_cast<unsigned>(foreground.g) * alpha + static_cast<unsigned>(background.g) * inverse) / 255U),
        static_cast<std::uint8_t>((static_cast<unsigned>(foreground.b) * alpha + static_cast<unsigned>(background.b) * inverse) / 255U),
        255,
    };
}

int fontPixelHeight(int scale) {
    return std::max(8, std::max(scale, 1) * 8);
}

int scaledAdvance(const CjkGlyph& glyph, int targetHeight) {
    return std::max(1, (static_cast<int>(glyph.advance) * targetHeight + static_cast<int>(kCjkGlyphHeight) / 2) / static_cast<int>(kCjkGlyphHeight));
}

void drawFontGlyph(Surface& surface, int x, int y, const CjkGlyph& glyph, Color color, int targetHeight) {
    const int sourceSize = static_cast<int>(kCjkGlyphWidth);
    for (int targetRow = 0; targetRow < targetHeight; ++targetRow) {
        const int sourceRowStart = targetRow * sourceSize / targetHeight;
        const int sourceRowEnd = std::max(sourceRowStart + 1, (targetRow + 1) * sourceSize / targetHeight);
        for (int targetColumn = 0; targetColumn < targetHeight; ++targetColumn) {
            const int sourceColumnStart = targetColumn * sourceSize / targetHeight;
            const int sourceColumnEnd = std::max(sourceColumnStart + 1, (targetColumn + 1) * sourceSize / targetHeight);
            unsigned total = 0;
            unsigned samples = 0;
            for (int sourceRow = sourceRowStart; sourceRow < sourceRowEnd; ++sourceRow) {
                for (int sourceColumn = sourceColumnStart; sourceColumn < sourceColumnEnd; ++sourceColumn) {
                    total += glyph.pixels[sourceRow * sourceSize + sourceColumn];
                    ++samples;
                }
            }
            const std::uint8_t coverage = static_cast<std::uint8_t>(total / std::max(1U, samples));
            if (coverage == 0) {
                continue;
            }
            const int targetX = x + targetColumn;
            const int targetY = y + targetRow;
            surface.setPixel(targetX, targetY, blendGlyphPixel(surface.pixel(targetX, targetY), color, coverage));
        }
    }
}

struct DecodedTextGlyph {
    std::uint32_t code = 0;
    int bytes = 0;
};

DecodedTextGlyph nextTextGlyph(const std::string& text, std::size_t index) {
    const unsigned char byte = static_cast<unsigned char>(text[index]);
    if (byte < 0x80U) {
        return DecodedTextGlyph{byte, 1};
    }
    const Utf8CodePoint decoded = decodeUtf8(text, index);
    return DecodedTextGlyph{decoded.code, decoded.bytes};
}

int textWidth(const std::string& text, int scale) {
    const int targetHeight = fontPixelHeight(scale);
    int width = 0;
    for (std::size_t index = 0; index < text.size();) {
        const DecodedTextGlyph decoded = nextTextGlyph(text, index);
        index += static_cast<std::size_t>(decoded.bytes);
        if (const CjkGlyph* glyph = findCjkGlyph(decoded.code)) {
            width += scaledAdvance(*glyph, targetHeight);
        } else {
            width += std::max(4, targetHeight / 2);
        }
    }
    return width;
}

Color agentIconColor(const std::string& agentId) {
    if (agentId == "deepseek-harness") {
        return palette::purple;
    }
    if (agentId == "claude-code" || agentId == "openclaw") {
        return palette::orange;
    }
    if (agentId == "hermes-agent") {
        return palette::green;
    }
    return palette::blue;
}

void fillCircle(Surface& surface, int centerX, int centerY, int radius, Color color) {
    if (radius <= 0) {
        return;
    }
    for (int y = -radius; y <= radius; ++y) {
        for (int x = -radius; x <= radius; ++x) {
            if (x * x + y * y <= radius * radius) {
                surface.setPixel(centerX + x, centerY + y, color);
            }
        }
    }
}

bool roundedContains(int pointX, int pointY, int x, int y, int width, int height, int radius) {
    if (pointX < x || pointY < y || pointX >= x + width || pointY >= y + height) {
        return false;
    }
    const int corner = std::max(0, std::min(radius, std::min(width, height) / 2));
    if (corner == 0) {
        return true;
    }
    int distanceX = 0;
    if (pointX < x + corner) {
        distanceX = x + corner - pointX;
    } else if (pointX >= x + width - corner) {
        distanceX = pointX - (x + width - corner - 1);
    }
    int distanceY = 0;
    if (pointY < y + corner) {
        distanceY = y + corner - pointY;
    } else if (pointY >= y + height - corner) {
        distanceY = pointY - (y + height - corner - 1);
    }
    return distanceX * distanceX + distanceY * distanceY <= corner * corner;
}

void fillRoundedRect(Surface& surface, int x, int y, int width, int height, int radius, Color color) {
    if (width <= 0 || height <= 0) {
        return;
    }
    for (int row = y; row < y + height; ++row) {
        for (int column = x; column < x + width; ++column) {
            if (roundedContains(column, row, x, y, width, height, radius)) {
                surface.setPixel(column, row, color);
            }
        }
    }
}

void strokeRoundedRect(Surface& surface, int x, int y, int width, int height, int radius, Color color) {
    if (width <= 0 || height <= 0) {
        return;
    }
    const int innerX = x + 1;
    const int innerY = y + 1;
    const int innerWidth = width - 2;
    const int innerHeight = height - 2;
    const int innerRadius = std::max(0, radius - 1);
    for (int row = y; row < y + height; ++row) {
        for (int column = x; column < x + width; ++column) {
            if (roundedContains(column, row, x, y, width, height, radius)
                && !roundedContains(column, row, innerX, innerY, innerWidth, innerHeight, innerRadius)) {
                surface.setPixel(column, row, color);
            }
        }
    }
}

void drawAgentIcon(Surface& surface, int x, int y, int size, const std::string& agentId, Color color) {
    fillRoundedRect(surface, x, y, size, size, size / 4, palette::iconTile);
    const int centerX = x + size / 2;
    const int centerY = y + size / 2;
    if (agentId == "codex") {
        fillCircle(surface, centerX, centerY, size / 4, Color{122, 145, 255, 255});
        fillRect(surface, centerX - size / 7, centerY - size / 12, size / 9, size / 9, palette::iconTile);
        fillRect(surface, centerX + size / 18, centerY - size / 12, size / 9, size / 9, palette::iconTile);
        drawLine(surface, centerX - size / 7, centerY + size / 8, centerX + size / 7, centerY + size / 8, palette::iconTile);
    } else if (agentId == "deepseek-harness") {
        fillCircle(surface, centerX, centerY, size / 4, Color{70, 101, 255, 255});
        drawLine(surface, x + size / 5, centerY + size / 8, centerX, centerY - size / 6, palette::iconTile);
        drawLine(surface, centerX, centerY - size / 6, x + 4 * size / 5, centerY + size / 8, palette::iconTile);
        drawLine(surface, x + size / 5, centerY + size / 8, x + size / 7, centerY + size / 5, Color{70, 101, 255, 255});
        drawLine(surface, x + 4 * size / 5, centerY + size / 8, x + 6 * size / 7, centerY + size / 5, Color{70, 101, 255, 255});
    } else if (agentId == "claude-code") {
        fillRect(surface, x + size / 4, y + size / 3, size / 2, size / 3, Color{217, 119, 87, 255});
        fillRect(surface, x + size / 3, y + size / 4, size / 3, size / 8, Color{217, 119, 87, 255});
        for (int leg = 0; leg < 3; ++leg) {
            const int legX = x + size / 4 + leg * size / 5;
            drawLine(surface, legX, y + 2 * size / 3, legX, y + 5 * size / 6, Color{217, 119, 87, 255});
        }
        fillRect(surface, x + size / 3, centerY - size / 12, size / 10, size / 10, palette::iconTile);
        fillRect(surface, x + size / 2, centerY - size / 12, size / 10, size / 10, palette::iconTile);
    } else if (agentId == "gemini-cli") {
        drawLine(surface, centerX, y + size / 5, x + 4 * size / 5, centerY, color);
        drawLine(surface, x + 4 * size / 5, centerY, centerX, y + 4 * size / 5, color);
        drawLine(surface, centerX, y + 4 * size / 5, x + size / 5, centerY, color);
        drawLine(surface, x + size / 5, centerY, centerX, y + size / 5, color);
    } else if (agentId == "hermes-agent") {
        drawLine(surface, x + size / 5, centerY, x + 4 * size / 5, y + size / 4, color);
        drawLine(surface, x + size / 5, centerY + size / 10, x + 4 * size / 5, centerY + size / 3, color);
    } else if (agentId == "openclaw") {
        fillCircle(surface, centerX, centerY, size / 4, Color{239, 76, 76, 255});
        fillCircle(surface, centerX - size / 10, centerY - size / 16, std::max(2, size / 16), palette::ink);
        fillCircle(surface, centerX + size / 10, centerY - size / 16, std::max(2, size / 16), palette::ink);
        drawLine(surface, centerX - size / 5, y + size / 5, centerX - size / 9, y + size / 3, Color{239, 76, 76, 255});
        drawLine(surface, centerX + size / 5, y + size / 5, centerX + size / 9, y + size / 3, Color{239, 76, 76, 255});
        drawLine(surface, x + size / 8, centerY, x + size / 4, centerY + size / 8, Color{239, 76, 76, 255});
        drawLine(surface, x + 7 * size / 8, centerY, x + 3 * size / 4, centerY + size / 8, Color{239, 76, 76, 255});
    } else if (agentId == "opencode") {
        drawLine(surface, x + size / 4, y + size / 5, x + size / 4, y + 4 * size / 5, color);
        drawLine(surface, x + 3 * size / 4, y + size / 5, x + 3 * size / 4, y + 4 * size / 5, color);
        drawLine(surface, x + size / 4, y + size / 5, x + size / 3, y + size / 5, color);
        drawLine(surface, x + size / 4, y + 4 * size / 5, x + size / 3, y + 4 * size / 5, color);
        drawLine(surface, x + 3 * size / 4, y + size / 5, x + 2 * size / 3, y + size / 5, color);
        drawLine(surface, x + 3 * size / 4, y + 4 * size / 5, x + 2 * size / 3, y + 4 * size / 5, color);
    } else {
        strokeRect(surface, x + size / 4, y + size / 4, size / 2, size / 2, color);
    }
}

Color inboxAccent(InboxStatus status) {
    switch (status) {
    case InboxStatus::Approved: return palette::green;
    case InboxStatus::Rejected: return palette::red;
    case InboxStatus::Deferred: return palette::purple;
    case InboxStatus::Pending: return palette::orange;
    }
    return palette::muted;
}

const InboxItem* selectedInbox(const UiState& state) {
    if (!state.selectedInboxId.empty()) {
        if (const InboxItem* item = findInboxItem(state.data, state.selectedInboxId)) {
            return item;
        }
    }
    for (const InboxItem& item : state.data.inbox) {
        if (item.status == InboxStatus::Pending) {
            return &item;
        }
    }
    return state.data.inbox.empty() ? nullptr : &state.data.inbox.front();
}

std::string inboxSummary(const InboxItem& item, const Agent* agent) {
    if (agent != nullptr && agent->id == "deepseek-harness") {
        return "dsh 开发者预览 · 插件状态待确认";
    }
    if (agent != nullptr && agent->id == "claude-code") {
        return "代码审查完成 · 等待你的合并决策";
    }
    if (agent != nullptr && agent->id == "openclaw") {
        return "研究任务已完成 · 可查看摘要";
    }
    if (item.kind == InboxKind::Approval) {
        return item.title + " · " + (item.risk == RiskLevel::High ? "高风险" : item.risk == RiskLevel::Medium ? "中风险" : "低风险");
    }
    return item.title;
}

void drawTopBar(Surface& surface, const UiState& state) {
    fillRect(surface, 0, 0, surface.width(), 72, palette::screenBackground);
    fillCircle(surface, 46, 36, 6, palette::orange);
    drawText(surface, 68, 28, state.data.device.link + "  " + std::to_string(state.data.device.rtt) + "ms  VPN", palette::ink, 2);
    fillCircle(surface, 248, 36, 5, state.data.device.vpn ? palette::muted : palette::red);
    const std::string displayText = "1024 × 768 · 60 Hz";
    const std::string batteryText = "电量 " + std::to_string(state.data.device.battery) + "%";
    const int batteryX = surface.width() - 116;
    const int displayX = batteryX - textWidth(displayText, 2) - 24;
    drawText(surface, displayX, 28, displayText, palette::muted, 2);
    drawText(surface, batteryX, 28, batteryText, palette::ink, 2);
    drawLine(surface, 24, 71, surface.width() - 24, 71, palette::line);
}

void drawFooter(Surface& surface, const UiState& state) {
    const int y = surface.height() - 58;
    fillRect(surface, 0, y, surface.width(), 58, palette::screenBackground);
    drawLine(surface, 24, y, surface.width() - 24, y, palette::line);
    drawText(surface, 64, y + 20, "Agent " + std::to_string(state.data.agents.size()), palette::muted, 2);
    drawText(surface, surface.width() / 2 - 70, y + 20, "服务器 " + std::to_string(state.data.servers.size()), palette::muted, 2);
    drawText(surface, surface.width() - 258, y + 20, "A 查看  B 返回  FN 语音", palette::muted, 2);
}

void drawInboxList(Surface& surface, const UiState& state, bool allItems) {
    const int contentWidth = surface.width() - 128;
    constexpr int cardHeight = 92;
    constexpr int cardGap = 14;
    int y = 198;
    for (const InboxItem& item : state.data.inbox) {
        if (!allItems && item.status != InboxStatus::Pending) {
            continue;
        }
        fillRoundedRect(surface, 64, y, contentWidth, cardHeight, 18, palette::cardBackground);
        strokeRoundedRect(surface, 64, y, contentWidth, cardHeight, 18, palette::line);
        const Agent* itemAgent = findAgent(state.data, item.agentId);
        drawAgentIcon(surface, 84, y + 14, 56, item.agentId, agentIconColor(item.agentId));
        drawText(surface, 168, y + 14, itemAgent != nullptr ? itemAgent->displayName : item.agentId, palette::ink, 3);
        drawText(surface, 168, y + 54, inboxSummary(item, itemAgent), palette::muted, 2);
        drawText(surface, surface.width() - 170, y + 26, item.timeLabel, palette::muted, 2);
        drawText(surface, surface.width() - 78, y + 28, ">", palette::muted, 3);
        y += cardHeight + cardGap;
        if (y + cardHeight > surface.height() - 80) {
            break;
        }
    }
    if (y == 198) {
        drawText(surface, 88, y + 24, "暂时没有需要处理的事项", palette::green, 2);
    }
}

void drawHomeOrNeeds(Surface& surface, const UiState& state) {
    const bool home = state.screen == Screen::Home;
    drawText(surface, 64, 88, home ? "现在需要你" : "Agent Inbox", palette::ink, home ? 6 : 5);
    drawText(surface, 64, 150, "Agent 有 " + std::to_string(pendingCount(state.data)) + " 个事项等待处理", palette::muted, 2);
    drawText(surface, surface.width() - 118, 92, std::to_string(pendingCount(state.data)), palette::orange, 6);
    drawText(surface, surface.width() - 118, 150, "待处理", palette::muted, 2);
    drawInboxList(surface, state, !home);
}

void drawApproval(Surface& surface, const UiState& state) {
    const InboxItem* item = selectedInbox(state);
    const Color accent = item == nullptr ? palette::muted : inboxAccent(item->status);
    drawText(surface, 64, 82, "审批", palette::ink, 4);
    fillRect(surface, 64, 116, 12, 30, accent);
    drawText(surface, 94, 118, item == nullptr ? "无条目" : toString(item->status), accent, 2);
    fillRect(surface, 64, 210, surface.width() - 128, 260, palette::cardBackground);
    strokeRect(surface, 64, 210, surface.width() - 128, 260, palette::line);
    if (item == nullptr) {
        drawText(surface, 88, 238, "未选择审批条目", palette::muted, 2);
        return;
    }
    drawAgentIcon(surface, 84, 214, 48, item->agentId, agentIconColor(item->agentId));
    drawText(surface, 148, 238, item->title, palette::ink, 2);
    drawText(surface, 148, 274, "风险 " + std::string(toString(item->risk)), accent, 2);
    drawText(surface, 148, 316, item->id, palette::ink, 2);
    drawText(surface, 148, 352, item->detail, palette::muted, 2);
    drawText(surface, 148, 400, "本地模拟数据 · 不写网络", palette::blue, 2);
    if (item->status == InboxStatus::Pending) {
        drawBadge(surface, 88, 512, "A 批准", palette::green);
        drawBadge(surface, 268, 512, "X 拒绝", palette::red);
        drawBadge(surface, 430, 512, "B 稍后", palette::purple);
    } else {
        drawBadge(surface, 88, 512, "决策 " + std::string(toString(item->status)), accent);
    }
}

void drawAgents(Surface& surface, const UiState& state) {
    drawText(surface, 64, 82, "代理", palette::ink, 4);
    drawText(surface, 64, 132, std::to_string(state.data.agents.size()) + " 个已注册 · 本地模拟数据", palette::muted, 2);
    int y = 160;
    for (const Agent& agent : state.data.agents) {
        fillRect(surface, 64, y, surface.width() - 128, 62, palette::cardBackground);
        strokeRect(surface, 64, y, surface.width() - 128, 62, palette::line);
        drawAgentIcon(surface, 82, y + 6, 48, agent.id, agentIconColor(agent.id));
        drawText(surface, 148, y + 8, agent.displayName, palette::ink, 2);
        drawText(surface, 360, y + 8, agent.project, palette::muted, 2);
        drawText(surface, 600, y + 12, toString(agent.status), agent.needsUser ? palette::orange : palette::green, 2);
        drawText(surface, 148, y + 32, agent.summary, palette::muted, 2);
        if (agent.availability == Availability::DeveloperPreview) {
            drawText(surface, 700, y + 32, "开发者预览", palette::blue, 2);
        }
        y += 72;
        if (y + 62 > surface.height() - 80) {
            break;
        }
    }
}

void drawServers(Surface& surface, const UiState& state) {
    drawText(surface, 64, 82, "服务器", palette::ink, 4);
    const ServerSnapshot* server = state.data.servers.empty() ? nullptr : &state.data.servers.front();
    if (server == nullptr) {
        drawText(surface, 64, 150, "无服务器快照", palette::muted, 2);
        return;
    }
    fillRect(surface, 64, 150, surface.width() - 128, 220, palette::cardBackground);
    strokeRect(surface, 64, 150, surface.width() - 128, 220, palette::line);
    drawText(surface, 88, 178, server->displayName + "  " + (server->status == "online" ? "在线" : server->status), palette::green, 3);
    drawText(surface, 88, 230, "延迟 " + std::to_string(server->rtt) + " 毫秒", palette::blue, 2);
    drawText(surface, 320, 230, "CPU " + std::to_string(server->cpu) + "%", palette::orange, 2);
    drawText(surface, 510, 230, "内存 " + std::to_string(server->ram) + "%", palette::purple, 2);
    drawText(surface, 720, 230, "磁盘 " + std::to_string(server->disk) + "%", palette::red, 2);
    drawText(surface, 88, 282, "负载 " + std::to_string(server->load) + "  Docker " + std::to_string(server->dockerRunning) + "+" + std::to_string(server->dockerRestarting), palette::ink, 2);
    drawText(surface, 88, 330, "网关 " + (server->gateway == "online" ? "在线" : server->gateway) + "  SSH " + (server->ssh == "online" ? "在线" : server->ssh), palette::muted, 2);
    drawText(surface, 64, 420, "本地模拟快照 · 只读", palette::blue, 2);
}

void drawTerminal(Surface& surface, const UiState& state) {
    drawText(surface, 64, 82, "终端", palette::ink, 4);
    fillRect(surface, 64, 150, surface.width() - 128, 320, palette::cardBackground);
    strokeRect(surface, 64, 150, surface.width() - 128, 320, palette::line);
    drawText(surface, 88, 184, "$ aht status --source fixture", palette::green, 2);
    drawText(surface, 88, 224, "数据源=fixture", palette::ink, 2);
    drawText(surface, 88, 254, "网关=不可用", palette::orange, 2);
    drawText(surface, 88, 284, "SSH=不可用", palette::orange, 2);
    drawText(surface, 88, 314, "文件写入=禁用", palette::blue, 2);
    drawText(surface, 88, 368, state.glyphAtlasAvailable ? "字形=已加载" : "字形=未加载", palette::muted, 2);
    drawText(surface, 64, 510, "只读 · 不执行远程命令", palette::red, 2);
}

} // namespace

void fillRect(Surface& surface, int x, int y, int width, int height, Color color) {
    if (width <= 0 || height <= 0) {
        return;
    }
    for (int row = y; row < y + height; ++row) {
        for (int column = x; column < x + width; ++column) {
            surface.setPixel(column, row, color);
        }
    }
}

void drawLine(Surface& surface, int x0, int y0, int x1, int y1, Color color) {
    const int dx = std::abs(x1 - x0);
    const int sx = x0 < x1 ? 1 : -1;
    const int dy = -std::abs(y1 - y0);
    const int sy = y0 < y1 ? 1 : -1;
    int error = dx + dy;
    while (true) {
        surface.setPixel(x0, y0, color);
        if (x0 == x1 && y0 == y1) {
            break;
        }
        const int twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x0 += sx;
        }
        if (twice <= dx) {
            error += dx;
            y0 += sy;
        }
    }
}

void strokeRect(Surface& surface, int x, int y, int width, int height, Color color) {
    if (width <= 0 || height <= 0) {
        return;
    }
    drawLine(surface, x, y, x + width - 1, y, color);
    drawLine(surface, x, y, x, y + height - 1, color);
    drawLine(surface, x + width - 1, y, x + width - 1, y + height - 1, color);
    drawLine(surface, x, y + height - 1, x + width - 1, y + height - 1, color);
}

void drawText(Surface& surface, int x, int y, const std::string& text, Color color, int scale) {
    const int targetHeight = fontPixelHeight(scale);
    int cursor = x;
    for (std::size_t index = 0; index < text.size();) {
        const DecodedTextGlyph decoded = nextTextGlyph(text, index);
        index += static_cast<std::size_t>(decoded.bytes);
        if (const CjkGlyph* glyph = findCjkGlyph(decoded.code)) {
            drawFontGlyph(surface, cursor, y, *glyph, color, targetHeight);
            cursor += scaledAdvance(*glyph, targetHeight);
        } else {
            drawUnsupportedGlyph(surface, cursor, y, color, std::max(1, targetHeight / 8));
            cursor += std::max(4, targetHeight / 2);
        }
    }
}

void drawBadge(Surface& surface, int x, int y, const std::string& text, Color color) {
    const int width = std::max(84, textWidth(text, 2) + 20);
    fillRect(surface, x, y, width, 34, palette::cardStrong);
    strokeRect(surface, x, y, width, 34, color);
    drawText(surface, x + 10, y + 10, text, color, 2);
}

NativeRenderer::NativeRenderer(int logicalWidth, int logicalHeight)
    : logicalWidth_(logicalWidth), logicalHeight_(logicalHeight) {}

void NativeRenderer::render(Surface& surface, const UiState& state) const {
    (void)logicalWidth_;
    (void)logicalHeight_;
    surface.clear(palette::pageBackground);
    drawTopBar(surface, state);
    switch (state.screen) {
    case Screen::Home:
    case Screen::Needs:
        drawHomeOrNeeds(surface, state);
        break;
    case Screen::Approval:
        drawApproval(surface, state);
        break;
    case Screen::Agents:
        drawAgents(surface, state);
        break;
    case Screen::Servers:
        drawServers(surface, state);
        break;
    case Screen::Terminal:
        drawTerminal(surface, state);
        break;
    }
    drawFooter(surface, state);
    surface.present();
}

} // namespace aht
