#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "MassEntityTypes.h"
#include "MassArchetypeTypes.h"
#include "KBVENpcSpriteRenderSubsystem.h"
#include "chuckSlimeSubsystem.generated.h"

class UKBVENetEntityReplicator;
class AchuckSlimeNetActor;
class UKBVENpcSpriteDef;
class USphereComponent;
class AActor;

UCLASS()
class CHUCK_API UchuckSlimeSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	void SpawnSlimes(const FVector& Center, int32 Count, float Radius);

private:
	UPROPERTY(Transient)
	TObjectPtr<UKBVENpcSpriteDef> SlimeDef;

	UPROPERTY(Transient)
	TWeakObjectPtr<AchuckSlimeNetActor> NetActor;

	TArray<FMassEntityHandle> Slimes;
	TArray<TArray<FVector>> Paths;
	TArray<FKBVENpcSpriteHandle> SlimeSprites;
	TMap<uint32, FKBVENpcSpriteHandle> ClientSprites;
	FMassArchetypeHandle Archetype;

	void EnsureSpriteDef();
	UKBVENpcSpriteRenderSubsystem* GetSpriteRenderer() const;
	UKBVENetEntityReplicator* EnsureReplicator(bool bAuthority);
	void TickServer(float DeltaTime);
	void UpdateHitProxies(const FVector& PlayerLoc);

	UPROPERTY(Transient)
	TObjectPtr<AActor> HitProxyHost;

	UPROPERTY(Transient)
	TArray<TObjectPtr<USphereComponent>> HitProxies;

	TArray<int32> HitProxySlime;

	static constexpr int32 MaxHitProxies = 96;
	static constexpr float HitProxyRange = 2600.f;
	static constexpr float HitProxyRadius = 62.f;
	static constexpr float HitProxyCenterZ = 58.f;
	void TickClientRender();
	float GroundTraceZ(double X, double Y, float Fallback) const;
	float GroundFootprintMinZ(double X, double Y, float Radius, float Fallback) const;
	void Repath(int32 SlimeIndex, const FVector& From);

	static constexpr int32 Cols = 5;
	static constexpr int32 Rows = 3;
	static constexpr int32 FrameCount = 15;
	static constexpr float FrameRate = 8.f;
	static constexpr float QuadScale = 1.5f;
	static constexpr float HalfHeight = 50.f * QuadScale;
	static constexpr float FootBias = 18.f;
	static constexpr float HopAmp = 28.f;
	static constexpr float HopRate = 6.f;
	static constexpr float HopMoveScale = 3.2f;
	static constexpr float FootprintRadius = 45.f;
};
