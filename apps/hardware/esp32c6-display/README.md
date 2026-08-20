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

## Wi-Fi and the BBS

The board can join a network and dial the KBVE BBS over telnet. Credentials are
baked in at compile time, so copy the sample and fill it in — `wifi.env` is
gitignored:

```bash
cp wifi.env.example wifi.env
```

| Variable        | Default        | Meaning                          |
| --------------- | -------------- | -------------------------------- |
| `WIFI_SSID`     | _(empty)_      | Network to join. Empty = offline |
| `WIFI_PASSWORD` | _(empty)_      | WPA2/WPA3 passphrase             |
| `BBS_HOST`      | `bbs.kbve.com` | Telnet host                      |

The nx targets source `wifi.env` before handing off to cargo, and `build.rs`
re-runs the build when any of those change.

With no `WIFI_SSID` the firmware stays offline and advertises over BLE as
before. With one set it skips BLE entirely — the crate does not enable
`esp-radio`'s `coex` feature, so the two radios never run at once.

Port `6401` is the BBS's ANSI listener; `6400` speaks PETSCII, which would mean
shipping C64 glyphs. The client announces a `28x32` window over NAWS and calls
itself `ansi` over TTYPE, so the server lays its screens out for the panel
rather than assuming a 40x25 C64.

Logging in is a device-code claim, not a token the board holds: the BBS prints
a code, you enter it at <https://kbve.com/bbs/> from any other device, and the
session upgrades in place.

## Why this is its own cargo workspace

The crate carries an empty `[workspace]` table. Folded into the root workspace,
this embedded-only dependency tree would be pulled through every host build and
would fight the repo's shared version pins. It builds standalone instead, which
is also why its nx targets shell out to `cargo` rather than using
`@monodon/rust`.
