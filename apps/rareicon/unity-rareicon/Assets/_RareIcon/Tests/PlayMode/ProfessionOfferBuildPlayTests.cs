using System.Collections;
using NUnit.Framework;
using Unity.Collections;
using Unity.Entities;
using UnityEngine.TestTools;

namespace RareIcon.Tests
{
    public class ProfessionOfferBuildPlayTests
    {
        [UnityTest]
        public IEnumerator OfferBuild_TicksWithoutJobSafetyViolation()
        {
            var world = new World("RareIcon.OfferBuildTest");
            Entity itemDB = Entity.Null;
            try
            {
                itemDB = CreateItemDB(world);
                SpawnHexResource(world, 0, 0, wood: 50, stone: 10, berries: 5);
                SpawnHexResource(world, 1, 0, wood: 0, stone: 30, berries: 0);
                SpawnHexResource(world, 2, 0, wood: 12, stone: 0, berries: 20);
                SpawnItemDrop(world, 3, 0, itemId: 1, count: 3);
                SpawnItemDrop(world, 4, 0, itemId: 2, count: 1);

                var sys = world.CreateSystem<ProfessionOfferBuildSystem>();

                for (int i = 0; i < 3; i++)
                {
                    sys.Update(world.Unmanaged);
                    yield return null;
                }

                world.EntityManager.CompleteAllTrackedJobs();

                var offers = world.EntityManager
                    .CreateEntityQuery(ComponentType.ReadOnly<ProfessionOffersSingleton>())
                    .GetSingleton<ProfessionOffersSingleton>();

                Assert.IsTrue(offers.OffersSortedByKind.IsCreated);
                Assert.AreEqual(offers.Offers.Length, offers.OffersSortedByKind.Length);
                Assert.GreaterOrEqual(offers.Offers.Length, 5);

                LogAssert.NoUnexpectedReceived();
            }
            finally
            {
                if (itemDB != Entity.Null && world.IsCreated)
                    DisposeItemDB(world, itemDB);
                if (world.IsCreated)
                    world.Dispose();
            }
        }

        static Entity CreateItemDB(World world)
        {
            var em = world.EntityManager;
            var e = em.CreateEntity();
            em.AddComponentData(e, new ItemDBSingleton
            {
                Defs           = new NativeArray<ItemDefRuntime>(1, Allocator.Persistent),
                ValidBits      = new NativeArray<ulong>(1, Allocator.Persistent),
                EdibleBits     = new NativeArray<ulong>(1, Allocator.Persistent),
                FoodPoolBits   = new NativeArray<ulong>(1, Allocator.Persistent),
                PerishableBits = new NativeArray<ulong>(1, Allocator.Persistent),
                MaxItemId      = 0,
            });
            return e;
        }

        static void DisposeItemDB(World world, Entity e)
        {
            var db = world.EntityManager.GetComponentData<ItemDBSingleton>(e);
            if (db.Defs.IsCreated)           db.Defs.Dispose();
            if (db.ValidBits.IsCreated)      db.ValidBits.Dispose();
            if (db.EdibleBits.IsCreated)     db.EdibleBits.Dispose();
            if (db.FoodPoolBits.IsCreated)   db.FoodPoolBits.Dispose();
            if (db.PerishableBits.IsCreated) db.PerishableBits.Dispose();
        }

        static void SpawnHexResource(World world, int q, int r, byte wood, byte stone, byte berries)
        {
            var em = world.EntityManager;
            var e = em.CreateEntity();
            em.AddComponentData(e, new HexCoord { Q = q, R = r });
            em.AddComponentData(e, new HexResources { Wood = wood, Stone = stone, Berries = berries });
        }

        static void SpawnItemDrop(World world, int q, int r, ushort itemId, ushort count)
        {
            var em = world.EntityManager;
            var e = em.CreateEntity();
            em.AddComponentData(e, new HexCoord { Q = q, R = r });
            var buf = em.AddBuffer<ItemDrop>(e);
            buf.Add(new ItemDrop { ItemId = itemId, Count = count, Hp = 0 });
        }
    }
}
