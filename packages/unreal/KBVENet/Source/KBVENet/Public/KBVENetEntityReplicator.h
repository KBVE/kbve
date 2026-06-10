#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Engine/NetSerialization.h"
#include "Net/Serialization/FastArraySerializer.h"
#include "KBVENetEntityReplicator.generated.h"

class UKBVENetEntityReplicator;

/**
 * One server-authoritative entity's replicated state. Lean by design: an id to
 * correlate with the source sim, a quantized location, packed yaw, an animation
 * frame, and one free state byte (e.g. facing row + flip). Delta-compressed by
 * the owning FFastArraySerializer; transported by Iris when the ReplicationSystem
 * is enabled, or the classic NetDriver otherwise.
 */
USTRUCT()
struct KBVENET_API FKBVENetEntitySnapshot : public FFastArraySerializerItem
{
	GENERATED_BODY()

	UPROPERTY()
	uint32 Id = 0;

	UPROPERTY()
	FVector_NetQuantize10 Location = FVector::ZeroVector;

	UPROPERTY()
	uint16 YawQ = 0;

	UPROPERTY()
	uint8 Frame = 0;

	UPROPERTY()
	uint8 StateByte = 0;

	void PostReplicatedAdd(const struct FKBVENetEntityArray& Array);
	void PostReplicatedChange(const struct FKBVENetEntityArray& Array);
	void PreReplicatedRemove(const struct FKBVENetEntityArray& Array);

	float YawDegrees() const { return (static_cast<float>(YawQ) / 65535.0f) * 360.0f; }
};

USTRUCT()
struct KBVENET_API FKBVENetEntityArray : public FFastArraySerializer
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FKBVENetEntitySnapshot> Items;

	TWeakObjectPtr<UKBVENetEntityReplicator> Owner;

	bool NetDeltaSerialize(FNetDeltaSerializeInfo& DeltaParms)
	{
		return FFastArraySerializer::FastArrayDeltaSerialize<FKBVENetEntitySnapshot, FKBVENetEntityArray>(Items, DeltaParms, *this);
	}
};

template<>
struct TStructOpsTypeTraits<FKBVENetEntityArray> : public TStructOpsTypeTraitsBase2<FKBVENetEntityArray>
{
	enum { WithNetDeltaSerializer = true };
};

/**
 * Streams a server-authoritative set of entity snapshots to clients. The sim
 * (e.g. a Mass subsystem) calls ServerUpsert/ServerRemove on the authority; the
 * client side reads GetSnapshots() and reacts to OnSnapshotsChanged to drive a
 * local renderer (ISM/HISM). Mass-agnostic — any id-keyed sim can use it.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent))
class KBVENET_API UKBVENetEntityReplicator : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVENetEntityReplicator();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void PostInitProperties() override;

	void ServerUpsert(uint32 Id, const FVector& Location, float YawDegrees, uint8 Frame, uint8 StateByte);
	void ServerRemove(uint32 Id);
	void ServerClear();

	const TArray<FKBVENetEntitySnapshot>& GetSnapshots() const { return Entities.Items; }

	DECLARE_MULTICAST_DELEGATE(FOnKBVENetSnapshotsChanged);
	FOnKBVENetSnapshotsChanged OnSnapshotsChanged;

	void NotifySnapshotsChanged() { OnSnapshotsChanged.Broadcast(); }

private:
	UPROPERTY(Replicated)
	FKBVENetEntityArray Entities;

	TMap<uint32, int32> IdToIndex;
};
