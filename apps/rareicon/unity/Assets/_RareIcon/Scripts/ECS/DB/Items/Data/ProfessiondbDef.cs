using System.Collections.Generic;
using Newtonsoft.Json;

namespace RareIcon
{
    public sealed class ProfessiondbRuntime
    {
        [JsonProperty("schema")]      public string Schema;
        [JsonProperty("version")]     public int Version;
        [JsonProperty("professions")] public List<ProfessionDef> Professions = new();
    }

    public sealed class ProfessionDef
    {
        [JsonProperty("ref")]     public string Ref;
        [JsonProperty("key")]     public int Key;
        [JsonProperty("name")]    public string Name;
        [JsonProperty("actions")] public List<ProfessionActionDef> Actions;
    }

    public sealed class ProfessionActionDef
    {
        [JsonProperty("ref")]             public string Ref;
        [JsonProperty("key")]             public int Key;
        [JsonProperty("resourceNodeRef")] public string ResourceNodeRef;
        [JsonProperty("harvestWeight")]   public int? HarvestWeight;
        [JsonProperty("inputs")]          public List<ProfessionResourceDef> Inputs;
        [JsonProperty("outputs")]         public List<ProfessionResourceDef> Outputs;
    }

    public sealed class ProfessionResourceDef
    {
        [JsonProperty("itemRef")]  public string ItemRef;
        [JsonProperty("quantity")] public int Quantity;
    }
}
