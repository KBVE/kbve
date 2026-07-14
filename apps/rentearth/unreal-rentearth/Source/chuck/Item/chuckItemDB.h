#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateBrush.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Textures/SlateShaderResource.h"
#include "KBVEDroppedItemVisual.h"
#include "KBVEItemTypes.h"
#include "chuckItemDB.generated.h"

class UTexture2D;

UCLASS()
class UchuckItemDB : public UGameInstanceSubsystem, public IKBVEDroppedItemVisualProvider
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	virtual bool GetDroppedItemVisual(int32 ItemKey, FKBVEDroppedItemVisual& OutVisual) const override;

	UFUNCTION()
	void HandleDroppedItemPickedUp(AActor* Picker, int32 ItemKey, int32 Count);

	const FKBVEItemDef* LookupByKey(int32 Key) const;
	const FKBVEItemDef* LookupByRef(FName Ref) const;

	const TArray<FKBVEItemDef>& GetAll() const { return ByKey; }
	int32 Num() const { return Items.Num(); }
	int32 MaxKey() const { return ByKey.Num() - 1; }

	bool HasAtlas() const { return AtlasTexture != nullptr; }
	const FSlateResourceHandle& GetAtlasHandle() const { return AtlasResourceHandle; }
	void GetIconUV(int32 ItemKey, FVector2D& OutUVTopLeft, FVector2D& OutUVBottomRight) const;
	UTexture2D* GetIconTexture(int32 ItemKey);
	UTexture2D* GetRadialDiscTexture();
	class UMaterialInterface* GetTranslucentBillboardMaterial();
	class UMaterialInstanceDynamic* GetIconMID(int32 ItemKey);
	class UMaterialInstanceDynamic* GetHaloMID(EKBVEItemRarity Rarity, const FLinearColor& RarityColor);

	static constexpr int32 AtlasGridSize = 32;
	static constexpr int32 AtlasTilePixels = 64;

private:
	void LoadFromJson(const FString& JsonText);
	void LoadAtlas();

	UPROPERTY() TArray<FKBVEItemDef> Items;
	UPROPERTY() TArray<FKBVEItemDef> ByKey;

	UPROPERTY() TObjectPtr<UTexture2D> AtlasTexture = nullptr;

	UPROPERTY()
	TMap<int32, TObjectPtr<UTexture2D>> IconTextureCache;

	UPROPERTY()
	TMap<int32, TObjectPtr<class UMaterialInstanceDynamic>> IconMIDCache;

	UPROPERTY()
	TMap<uint8, TObjectPtr<class UMaterialInstanceDynamic>> HaloMIDByRarity;

	UPROPERTY()
	TObjectPtr<UTexture2D> RadialDiscTex = nullptr;

	UPROPERTY()
	TObjectPtr<class UMaterialInterface> TranslucentBillboardMat = nullptr;

	TArray<FColor> AtlasPixels;
	int32 AtlasW = 0;
	int32 AtlasH = 0;

	FSlateBrush AtlasBrush;
	FSlateResourceHandle AtlasResourceHandle;

	TMap<FName, int32> RefToKey;
};
