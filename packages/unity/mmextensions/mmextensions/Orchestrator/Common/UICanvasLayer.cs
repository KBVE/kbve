namespace KBVE.MMExtensions.Orchestrator.Core
{
    public enum UICanvasLayer
    {
        Toast,
        Modal,
        Tooltip,
        Overlay,
        HUD
    }

    public static class UICanvasLayerDefaults
    {
        public static int GetSortingOrder(UICanvasLayer layer) => layer switch
        {
            UICanvasLayer.HUD => 100,
            UICanvasLayer.Overlay => 200,
            UICanvasLayer.Tooltip => 300,
            UICanvasLayer.Modal => 400,
            UICanvasLayer.Toast => 500,
            _ => 0
        };
    }
}