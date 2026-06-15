#ifndef KBVE_WGPU_H
#define KBVE_WGPU_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct WgpuSurface WgpuSurface;

typedef struct {
    uint32_t kind;
    float x;
    float y;
    uint32_t id;
} FfiInputEvent;

WgpuSurface *kbve_wgpu_create(void *raw, uint32_t kind, uint32_t width, uint32_t height);
void kbve_wgpu_resize(WgpuSurface *surface, uint32_t width, uint32_t height);
int32_t kbve_wgpu_render(WgpuSurface *surface);
void kbve_wgpu_pause(WgpuSurface *surface, bool paused);
void kbve_wgpu_input(WgpuSurface *surface, FfiInputEvent event);
void kbve_wgpu_set_jwt(WgpuSurface *surface, const uint8_t *jwt, size_t len);
void kbve_wgpu_destroy(WgpuSurface *surface);

#ifdef __cplusplus
}
#endif

#endif
