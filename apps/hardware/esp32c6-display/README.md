# esp32c6-display

Firmware for the Waveshare **ESP32-C6-LCD-1.47** — a 172x320 ST7789 panel on a
RISC-V ESP32-C6, written against `esp-hal` (`no_std`).

## Board wiring

Fixed on the board, not jumpered:

| Signal   | GPIO |
| -------- | ---- |
| LCD MOSI | 6    |
| LCD SCLK | 7    |
| LCD CS   | 14   |
| LCD DC   | 15   |
| LCD RST  | 21   |
| LCD BL   | 22   |
| RGB LED  | 8    |

The panel is a 172-wide window on a 240-wide ST7789, centred, so every write is
offset by 34 columns. Get that wrong and the image slides sideways and wraps —
the four orange corner squares in `main.rs` are there to make it obvious.

## Toolchain

The C6 is RISC-V, so stock Rust covers it — no Xtensa fork:

```bash
rustup target add riscv32imac-unknown-none-elf
cargo install espflash --locked
```

## Use

```bash
./kbve.sh -nx esp32c6-display:build     # compile
./kbve.sh -nx esp32c6-display:flash     # flash over USB-C, then monitor
./kbve.sh -nx esp32c6-display:monitor   # attach to a running board
```

The board exposes a **built-in USB Serial/JTAG** peripheral, so the USB-C port
alone does flashing, logging and debugging. No external probe. It enumerates on
macOS as `/dev/cu.usbmodem*` with no driver, VID `0x303A` PID `0x1001`, and its
USB serial number is the board's MAC — handy once more than one is plugged in.

## Why this is its own cargo workspace

The crate carries an empty `[workspace]` table. Folded into the root workspace,
this embedded-only dependency tree would be pulled through every host build and
would fight the repo's shared version pins. It builds standalone instead, which
is also why its nx targets shell out to `cargo` rather than using
`@monodon/rust`.
