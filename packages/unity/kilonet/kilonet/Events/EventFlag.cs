using System;

namespace KBVE.Kilonet.Events
{

    [Flags]
    public enum EventFlag
    {
        None = 0,
        OnMainMenu = 1 << 0,   // Binary: 0001 (1)
        OnPlaying = 1 << 1,    // Binary: 0010 (2)
        OnPaused = 1 << 2,     // Binary: 0100 (4)
        OnGameOver = 1 << 3,   // Binary: 1000 (8)
        OnLoading = 1 << 4     // Binary: 10000 (16)
    }
}
