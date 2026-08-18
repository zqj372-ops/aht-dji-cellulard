AHT for TRIMUI Brick Pro MainUI
===============================

Copy this folder to /mnt/SDCARD/Apps/AHT on the Brick Pro (or keep the
dist-app/AHT build output there). MainUI scans /mnt/SDCARD/Apps and reads
config.json, then runs launch.sh when AHT is selected.

Controls
--------

- D-pad / left stick: navigate lists
- A: open item / approve
- X: reject
- B: back
- Y: Agents
- SELECT: Home
- START: quit and return to MainUI

The app only renders the current AHT fixture state. Gateway, SSH, Mosh, 4G,
microphone, and production Agent connections are explicitly unavailable.
