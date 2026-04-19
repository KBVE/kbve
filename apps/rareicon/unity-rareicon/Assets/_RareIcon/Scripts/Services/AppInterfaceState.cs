namespace RareIcon
{
    /// <summary>
    /// Top-level UI state. Drives which HUD is visible and which input/click
    /// pathways are active. Lifted from Unity's DotsUI sample (InterfaceState).
    /// </summary>
    public enum AppInterfaceState
    {
        Boot,
        World,
        EnterModal,
        InTile,
    }
}
