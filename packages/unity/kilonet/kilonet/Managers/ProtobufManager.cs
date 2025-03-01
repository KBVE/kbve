using Cysharp.Threading.Tasks;
using KBVE.Kilonet.Networks;

namespace KBVE.Kilonet.Managers
{
  public static class ProtobufManager
  {
    private static ProtobufProtocol protobufProtocol;

    public static void Initialize()
    {
      protobufProtocol = new ProtobufProtocol();
      RegisterCoreTypes();
    }

    private static void RegisterCoreTypes()
    {
      var model = protobufProtocol.Model;
      model.Add(typeof(AuthMessage), false).Add("BearerToken", "RoomId");
      model.Add(typeof(ChatMessage), false).Add("SenderId", "RecipientId", "Content");
      model.Add(typeof(GameStateMessage), false).Add("Players", "NPCs");
      
      //    [NPC]
      model.Add(typeof(BaseNPC), false).Add("NPCId", "Name", "PositionX", "PositionY", "PositionZ");
      model.Add(typeof(TraderNPC), false).Add("Inventory");
      model.Add(typeof(MonsterNPC), false).Add("Health", "AttackPower", "Defense");
      model.Add(typeof(BossNPC), false).Add("BossMechanics", "DifficultyLevel");
    }

    public static async UniTask<byte[]> SerializeAsync<T>(T message)
    {
      return await UniTask.Run(() => protobufProtocol.Serialize(message));
    }

    public static async UniTask<T> DeserializeAsync<T>(byte[] data)
    {
      return await UniTask.Run(() => protobufProtocol.Deserialize<T>(data));
    }
  }
}
