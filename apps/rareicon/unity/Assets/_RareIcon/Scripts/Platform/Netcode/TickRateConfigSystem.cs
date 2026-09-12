using Unity.Entities;
using Unity.NetCode;

namespace RareIcon.Platform
{
    /// <summary>Sets <see cref="ClientServerTickRate"/> to 30Hz Simulation + 30Hz Network on world create.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ServerSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial struct TickRateConfigSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            if (SystemAPI.HasSingleton<ClientServerTickRate>())
            {
                var rw = SystemAPI.GetSingletonRW<ClientServerTickRate>();
                ref var rate = ref rw.ValueRW;
                rate.SimulationTickRate = 30;
                rate.NetworkTickRate    = 30;
                state.Enabled = false;
                return;
            }

            var tickRate = new ClientServerTickRate();
            tickRate.ResolveDefaults();
            tickRate.SimulationTickRate = 30;
            tickRate.NetworkTickRate    = 30;

            var e = state.EntityManager.CreateEntity(typeof(ClientServerTickRate));
            state.EntityManager.SetComponentData(e, tickRate);
            state.EntityManager.SetName(e, "ClientServerTickRate");
            state.Enabled = false;
        }

        public void OnUpdate(ref SystemState state) { }
        public void OnDestroy(ref SystemState state) { }
    }
}
