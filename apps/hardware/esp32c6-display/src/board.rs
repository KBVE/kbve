pub const PANEL_WIDTH: u16 = 172;
pub const PANEL_HEIGHT: u16 = 320;
pub const COLUMN_OFFSET: u16 = (ST7789_WIDTH - PANEL_WIDTH) / 2;
pub const ROW_OFFSET: u16 = 0;

const ST7789_WIDTH: u16 = 240;

pub const BACKLIGHT_PCT: u8 = 40;
pub const BACKLIGHT_KHZ: u32 = 5;

pub const SPI_MHZ: u32 = 40;
pub const DRAW_BUFFER: usize = 2048;
