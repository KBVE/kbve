#include "KBVENpcSpawner.h"

#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"

FKBVENpcFragment UKBVENpcSpawner::MakeFragment(const FKBVENpcDef& Def, int32 LevelOverride)
{
	FKBVENpcFragment Fragment;
	Fragment.NpcRef       = Def.Ref;
	Fragment.Level        = (LevelOverride > 0) ? LevelOverride : Def.Level;
	Fragment.FactionId    = Def.FactionId;
	Fragment.AggroRange   = Def.AggroRange;
	Fragment.bFirstStrike = Def.bFirstStrike;
	return Fragment;
}

FMassEntityHandle UKBVENpcSpawner::SpawnNpcEntity(const FKBVENpcDef& Def, int32 LevelOverride)
{
	UWorld* World = GetWorld();
	UMassEntitySubsystem* MassSub = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (!MassSub)
	{
		return FMassEntityHandle();
	}

	FMassEntityManager& EntityManager = MassSub->GetMutableEntityManager();

	const UScriptStruct* FragmentTypes[] = { FKBVENpcFragment::StaticStruct() };
	const FMassArchetypeHandle Archetype = EntityManager.CreateArchetype(MakeArrayView(FragmentTypes, 1));
	const FMassEntityHandle Entity = EntityManager.CreateEntity(Archetype);

	EntityManager.GetFragmentDataChecked<FKBVENpcFragment>(Entity) = MakeFragment(Def, LevelOverride);
	return Entity;
}
