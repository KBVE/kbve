#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateBrush.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Textures/SlateShaderResource.h"
#include "chuckItemTypes.h"
#include "chuckItemDB.generated.h"

class UTexture2D;

UCLASS()
class UchuckItemDB : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	const FchuckItemDef* LookupByKey(int32 Key) const;
	const FchuckItemDef* LookupByRef(FName Ref) const;

	const TArray<FchuckItemDef>& GetAll() const { return ByKey; }
	int32 Num() const { return Items.Num(); }
	int32 MaxKey() const { return ByKey.Num() - 1; }

	bool HasAtlas() const { return AtlasTexture != nullptr; }
	const FSlateResourceHandle& GetAtlasHandle() const { return AtlasResourceHandle; }
	void GetIconUV(int32 ItemKey, FVector2D& OutUVTopLeft, FVector2D& OutUVBottomRight) const;

	static constexpr int32 AtlasGridSize = 16;
	static constexpr int32 AtlasTilePixels = 64;

private:
	void LoadFromJson(const FString& JsonText);
	void LoadAtlas();

	UPROPERTY() TArray<FchuckItemDef> Items;
	UPROPERTY() TArray<FchuckItemDef> ByKey;

	UPROPERTY() TObjectPtr<UTexture2D> AtlasTexture = nullptr;

	FSlateBrush AtlasBrush;
	FSlateResourceHandle AtlasResourceHandle;

	TMap<FName, int32> RefToKey;
};
