#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

static void emit(int fd, int type, int code, int value) {
    struct input_event event;
    memset(&event, 0, sizeof(event));
    event.type = (__u16)type;
    event.code = (__u16)code;
    event.value = (__s32)value;
    if (write(fd, &event, sizeof(event)) != (ssize_t)sizeof(event)) {
        perror("write input event");
        exit(1);
    }
}

static void syn(int fd) {
    emit(fd, EV_SYN, SYN_REPORT, 0);
}

static void enable_key(int fd, int code) {
    if (ioctl(fd, UI_SET_EVBIT, EV_KEY) < 0 || ioctl(fd, UI_SET_KEYBIT, code) < 0) {
        perror("enable key bit");
        exit(1);
    }
}

static void enable_abs(int fd, struct uinput_user_dev* device, int axis, int min, int max) {
    if (ioctl(fd, UI_SET_EVBIT, EV_ABS) < 0 || ioctl(fd, UI_SET_ABSBIT, axis) < 0) {
        perror("enable abs bit");
        exit(1);
    }
    device->absmin[axis] = min;
    device->absmax[axis] = max;
    device->absfuzz[axis] = 0;
    device->absflat[axis] = 0;
}

static int create_pad(void) {
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) {
        perror("open /dev/uinput");
        return -1;
    }

    struct uinput_user_dev device;
    memset(&device, 0, sizeof(device));
    snprintf(device.name, sizeof(device.name), "TRIMUI Player1");
    device.id.bustype = BUS_USB;
    device.id.vendor = 0x045e;
    device.id.product = 0x028e;
    device.id.version = 0x0114;

    static const int keys[] = {
        KEY_LEFT,
        KEY_RIGHT,
        KEY_UP,
        KEY_DOWN,
        KEY_F1,
        KEY_F2,
        KEY_VOLUMEDOWN,
        KEY_VOLUMEUP,
        KEY_HOMEPAGE,
        BTN_A,
        BTN_B,
        BTN_X,
        BTN_Y,
        BTN_TL,
        BTN_TR,
        BTN_SELECT,
        BTN_START,
        BTN_MODE,
        BTN_THUMBL,
        BTN_THUMBR,
    };
    for (size_t index = 0; index < sizeof(keys) / sizeof(keys[0]); ++index) {
        enable_key(fd, keys[index]);
    }

    enable_abs(fd, &device, ABS_X, -32767, 32767);
    enable_abs(fd, &device, ABS_Y, -32767, 32767);
    enable_abs(fd, &device, ABS_Z, 0, 255);
    enable_abs(fd, &device, ABS_RX, -32767, 32767);
    enable_abs(fd, &device, ABS_RY, -32767, 32767);
    enable_abs(fd, &device, ABS_RZ, 0, 255);
    enable_abs(fd, &device, ABS_HAT0X, -1, 1);
    enable_abs(fd, &device, ABS_HAT0Y, -1, 1);

    if (write(fd, &device, sizeof(device)) != (ssize_t)sizeof(device)) {
        perror("write uinput_user_dev");
        close(fd);
        return -1;
    }
    if (ioctl(fd, UI_DEV_CREATE) < 0) {
        perror("UI_DEV_CREATE");
        close(fd);
        return -1;
    }
    return fd;
}

static void run_commands(int fd) {
    char line[256];
    while (fgets(line, sizeof(line), stdin) != NULL) {
        char command[64] = "";
        int first = 0;
        int second = 0;
        if (sscanf(line, "%63s %d %d", command, &first, &second) < 1) {
            continue;
        }
        if (strcmp(command, "key") == 0) {
            emit(fd, EV_KEY, first, 1);
            syn(fd);
            if (second > 0) {
                usleep((useconds_t)second * 1000);
            }
            emit(fd, EV_KEY, first, 0);
            syn(fd);
        } else if (strcmp(command, "hatx") == 0) {
            emit(fd, EV_ABS, ABS_HAT0X, first);
            syn(fd);
        } else if (strcmp(command, "haty") == 0) {
            emit(fd, EV_ABS, ABS_HAT0Y, first);
            syn(fd);
        } else if (strcmp(command, "abs") == 0) {
            emit(fd, EV_ABS, first, second);
            syn(fd);
        } else if (strcmp(command, "sleep") == 0) {
            usleep((useconds_t)first * 1000);
        } else if (strcmp(command, "quit") == 0) {
            break;
        }
    }
}

int main(void) {
    int fd = create_pad();
    if (fd < 0) {
        return 1;
    }
    fprintf(stderr, "uinput pad created: TRIMUI Player1\n");
    run_commands(fd);
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
    return 0;
}
