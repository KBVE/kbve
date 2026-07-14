#include "KBVENetEntityReplicator.h"
#include "Net/UnrealNetwork.h"

void FKBVENetEntitySnapshot::PostReplicatedAdd(const FKBVENetEntityArray& Array)
{
	if (Array.Owner.IsValid())
	{
		Array.Owner->NotifySnapshotsChanged();
	}
}

void FKBVENetEntitySnapshot::PostReplicatedChange(const FKBVENetEntityArray& Array)
{
	if (Array.Owner.IsValid())
	{
		Array.Owner->NotifySnapshotsChanged();
	}
}

void FKBVENetEntitySnapshot::PreReplicatedRemove(const FKBVENetEntityArray& Array)
{
	if (Array.Owner.IsValid())
	{
		Array.Owner->NotifySnapshotsChanged();
	}
}

UKBVENetEntityReplicator::UKBVENetEntityReplicator()
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(true);
}

void UKBVENetEntityReplicator::PostInitProperties()
{
	Super::PostInitProperties();
	Entities.Owner = this;
}

void UKBVENetEntityReplicator::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UKBVENetEntityReplicator, Entities);
}

void UKBVENetEntityReplicator::ServerUpsert(uint32 Id, const FVector& Location, float YawDegrees, uint8 Frame, uint8 StateByte)
{
	const float Wrapped = FMath::Fmod(FMath::Fmod(YawDegrees, 360.0f) + 360.0f, 360.0f);
	const uint16 YawQ = static_cast<uint16>(FMath::Clamp(Wrapped / 360.0f, 0.0f, 1.0f) * 65535.0f);

	if (const int32* Found = IdToIndex.Find(Id))
	{
		FKBVENetEntitySnapshot& Item = Entities.Items[*Found];
		Item.Location = Location;
		Item.YawQ = YawQ;
		Item.Frame = Frame;
		Item.StateByte = StateByte;
		Entities.MarkItemDirty(Item);
		return;
	}

	FKBVENetEntitySnapshot Item;
	Item.Id = Id;
	Item.Location = Location;
	Item.YawQ = YawQ;
	Item.Frame = Frame;
	Item.StateByte = StateByte;
	const int32 Index = Entities.Items.Add(Item);
	IdToIndex.Add(Id, Index);
	Entities.MarkItemDirty(Entities.Items[Index]);
}

void UKBVENetEntityReplicator::ServerRemove(uint32 Id)
{
	const int32* Found = IdToIndex.Find(Id);
	if (!Found)
	{
		return;
	}
	const int32 Index = *Found;
	const int32 Last = Entities.Items.Num() - 1;
	if (Index != Last)
	{
		Entities.Items[Index] = Entities.Items[Last];
		IdToIndex[Entities.Items[Index].Id] = Index;
		Entities.MarkItemDirty(Entities.Items[Index]);
	}
	Entities.Items.RemoveAt(Last);
	IdToIndex.Remove(Id);
	Entities.MarkArrayDirty();
}

void UKBVENetEntityReplicator::ServerClear()
{
	Entities.Items.Reset();
	IdToIndex.Reset();
	Entities.MarkArrayDirty();
}
