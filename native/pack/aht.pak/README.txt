AHT native Brick Pro pak
========================

This is a local-first native AHT fixture client for a Linux ARM64 Brick Pro
environment. It is a tool pak, not a firmware image and not a replacement for
the official Brick Pro system.

Contents
--------

- launch.sh
- aht-native-arm64
- README.txt

Install / run
-------------

Copy the complete aht.pak directory to the tool/PAK location used by the
confirmed Brick Pro runtime. The launcher defaults to /dev/fb0. Override the
framebuffer or input node without editing the package:

  AHT_FRAMEBUFFER=/dev/fb0 AHT_INPUT_DEVICE=/dev/input/event0 ./launch.sh

The first version renders the current AHT fixture state only. Gateway, SSH,
Mosh, 4G, microphone, and production Agent connections are explicitly
unavailable. Decisions update memory only and do not write firmware, SD-card
system files, or remote services.

Host validation
---------------

The repository can render without hardware:

  ./native/build/aht-native --headless --actions 'n,enter,x,b,s,t,h,quit'

The ARM64 file is cross-compiled and ELF-checked on the host; a successful
build is not evidence of a Brick Pro launch. Device validation must record the
actual framebuffer ioctl values, input event node, and the five-page key flow.
