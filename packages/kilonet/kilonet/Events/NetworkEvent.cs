using System;

namespace KBVE.Kilonet.Events
{
    [Flags]
    public enum NetworkEvent
    {
        None = 0,
        Connected = 1 << 0,       // Binary: 0001 (1)
        Disconnected = 1 << 1,    // Binary: 0010 (2)
        DataReceived = 1 << 2,    // Binary: 0100 (4)
        Error = 1 << 3,           // Binary: 1000 (8)
    }
}