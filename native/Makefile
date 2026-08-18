ZIG ?= zig
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic -Wno-nullability-completeness

BUILD := build
MODEL_TEST := $(BUILD)/model-test
RENDERER_TEST := $(BUILD)/renderer-test
UI_TEST := $(BUILD)/ui-test
HOST_BINARY := $(BUILD)/aht-native
ARM64_BINARY := $(BUILD)/aht-native-arm64
UINPUT_PAD := $(BUILD)/uinput-pad-arm64
PACKAGE_DIR := dist-native/aht.pak
APP_SOURCE_DIR := app/AHT
APP_PACKAGE_DIR := dist-app/AHT
CJK_HEADER := include/aht/cjk_glyphs.hpp
ICON_TEST := tests/icon_test.py
VENDOR_MONO := ../vendor/lobehub-icons/es/Grok/components/Mono.js
ICON_SOURCE := $(VENDOR_MONO)

NATIVE_SOURCES := src/model.cpp src/framebuffer.cpp src/renderer.cpp src/ui.cpp src/input.cpp src/main.cpp
NATIVE_HEADERS := include/aht/model.hpp include/aht/framebuffer.hpp include/aht/renderer.hpp include/aht/ui.hpp include/aht/input.hpp $(CJK_HEADER)

.PHONY: model-test renderer-test ui-test icon-test test host host-smoke arm64 cjk-font uinput-pad icon grok-svg favicon app-package package clean

model-test: $(MODEL_TEST)
	./$(MODEL_TEST)

$(MODEL_TEST): tests/model_test.cpp src/model.cpp include/aht/model.hpp | $(BUILD)
	$(ZIG) c++ $(CXXFLAGS) -Iinclude tests/model_test.cpp src/model.cpp -o $@

renderer-test: $(RENDERER_TEST)
	./$(RENDERER_TEST)

$(RENDERER_TEST): tests/renderer_test.cpp src/model.cpp src/framebuffer.cpp src/renderer.cpp $(NATIVE_HEADERS) | $(BUILD)
	$(ZIG) c++ $(CXXFLAGS) -Iinclude tests/renderer_test.cpp src/model.cpp src/framebuffer.cpp src/renderer.cpp -o $@

ui-test: $(UI_TEST)
	./$(UI_TEST)

$(UI_TEST): tests/ui_test.cpp src/model.cpp src/ui.cpp include/aht/model.hpp include/aht/ui.hpp | $(BUILD)
	$(ZIG) c++ $(CXXFLAGS) -Iinclude tests/ui_test.cpp src/model.cpp src/ui.cpp -o $@

icon-test:
	python3 $(ICON_TEST)

test: model-test renderer-test ui-test icon-test

host: $(HOST_BINARY)

$(HOST_BINARY): $(NATIVE_SOURCES) $(NATIVE_HEADERS) | $(BUILD)
	$(ZIG) c++ $(CXXFLAGS) -Iinclude $(NATIVE_SOURCES) -o $@

host-smoke: host
	./$(HOST_BINARY) --headless --actions 'n,enter,x,b,s,t,h,quit' --screenshot /tmp/aht-native-smoke.ppm

arm64: $(ARM64_BINARY)

$(ARM64_BINARY): $(NATIVE_SOURCES) $(NATIVE_HEADERS) | $(BUILD)
	$(ZIG) c++ $(CXXFLAGS) -target aarch64-linux-musl -static -Iinclude $(NATIVE_SOURCES) -o $@

cjk-font: $(CJK_HEADER)

$(CJK_HEADER): src/renderer.cpp src/model.cpp tools/make_cjk_font.py
	python3 tools/make_cjk_font.py $@

uinput-pad: $(UINPUT_PAD)

$(UINPUT_PAD): tools/uinput_pad.c | $(BUILD)
	$(ZIG) cc -target aarch64-linux-musl -static -O2 -Wall -Wextra tools/uinput_pad.c -o $@

icon: $(APP_SOURCE_DIR)/icon.png

$(APP_SOURCE_DIR)/icon.png: tools/make_icon.py $(VENDOR_MONO)
	python3 tools/make_icon.py $@

grok-svg: ../src/assets/agents/grok.svg

../src/assets/agents/grok.svg: tools/sync_grok_svg.py $(VENDOR_MONO)
	python3 tools/sync_grok_svg.py

favicon: ../public/favicon.png

../public/favicon.png: tools/make_icon.py $(VENDOR_MONO)
	python3 tools/make_icon.py $@ --favicon

app-package: arm64 icon
	mkdir -p $(APP_PACKAGE_DIR)
	cp $(ARM64_BINARY) $(APP_PACKAGE_DIR)/aht-native-arm64
	cp $(APP_SOURCE_DIR)/launch.sh $(APP_PACKAGE_DIR)/launch.sh
	cp $(APP_SOURCE_DIR)/config.json $(APP_PACKAGE_DIR)/config.json
	cp $(APP_SOURCE_DIR)/README.txt $(APP_PACKAGE_DIR)/README.txt
	cp $(APP_SOURCE_DIR)/icon.png $(APP_PACKAGE_DIR)/icon.png
	chmod +x $(APP_PACKAGE_DIR)/launch.sh $(APP_PACKAGE_DIR)/aht-native-arm64

package: arm64
	rm -rf $(PACKAGE_DIR)
	mkdir -p $(PACKAGE_DIR)
	cp pack/aht.pak/launch.sh $(PACKAGE_DIR)/launch.sh
	cp pack/aht.pak/README.txt $(PACKAGE_DIR)/README.txt
	cp $(ARM64_BINARY) $(PACKAGE_DIR)/aht-native-arm64
	chmod +x $(PACKAGE_DIR)/launch.sh $(PACKAGE_DIR)/aht-native-arm64

$(BUILD):
	mkdir -p $(BUILD)

clean:
	rm -rf $(BUILD)
