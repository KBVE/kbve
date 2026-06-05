#include "chuckItemDB.h"

#include "Engine/Texture2D.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformFileManager.h"
#include "ImageUtils.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Rendering/SlateRenderer.h"
#include "UObject/ConstructorHelpers.h"
#if WITH_EDITORONLY_DATA
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionTextureSampleParameter2D.h"
#include "Materials/MaterialExpressionVectorParameter.h"
#endif

#include "KBVEYYJson.h"

namespace
{
	static EchuckItemRarity ParseRarity(const char* Str)
	{
		if (!Str) return EchuckItemRarity::Common;
		if (FCStringAnsi::Strcmp(Str, "ITEM_RARITY_UNCOMMON")  == 0) return EchuckItemRarity::Uncommon;
		if (FCStringAnsi::Strcmp(Str, "ITEM_RARITY_RARE")      == 0) return EchuckItemRarity::Rare;
		if (FCStringAnsi::Strcmp(Str, "ITEM_RARITY_EPIC")      == 0) return EchuckItemRarity::Epic;
		if (FCStringAnsi::Strcmp(Str, "ITEM_RARITY_LEGENDARY") == 0) return EchuckItemRarity::Legendary;
		if (FCStringAnsi::Strcmp(Str, "ITEM_RARITY_MYTHIC")    == 0) return EchuckItemRarity::Mythic;
		return EchuckItemRarity::Common;
	}

	static FString StrFieldUtf8(yyjson_val* Obj, const char* Key)
	{
		yyjson_val* V = yyjson_obj_get(Obj, Key);
		if (V && yyjson_is_str(V))
		{
			return FString(UTF8_TO_TCHAR(yyjson_get_str(V)));
		}
		return FString();
	}

	static int32 IntFieldUtf8(yyjson_val* Obj, const char* Key, int32 Default = 0)
	{
		yyjson_val* V = yyjson_obj_get(Obj, Key);
		if (V && yyjson_is_int(V)) return (int32)yyjson_get_int(V);
		if (V && yyjson_is_uint(V)) return (int32)yyjson_get_uint(V);
		if (V && yyjson_is_real(V)) return (int32)yyjson_get_real(V);
		return Default;
	}

	static bool BoolFieldUtf8(yyjson_val* Obj, const char* Key, bool Default = false)
	{
		yyjson_val* V = yyjson_obj_get(Obj, Key);
		if (V && yyjson_is_bool(V)) return yyjson_get_bool(V);
		return Default;
	}
}

void UchuckItemDB::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString Path = FPaths::ProjectContentDir() / TEXT("Data/itemdb-data.json");
	UE_LOG(LogTemp, Warning, TEXT("[chuckItemDB] Initialize, reading %s"), *Path);
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		UE_LOG(LogTemp, Error, TEXT("[chuckItemDB] failed to load %s"), *Path);
		return;
	}
	LoadFromJson(Text);
	UE_LOG(LogTemp, Warning, TEXT("[chuckItemDB] loaded %d items (max key=%d)"), Items.Num(), MaxKey());

	LoadAtlas();
}

void UchuckItemDB::LoadAtlas()
{
	const FString AtlasPath = FPaths::ProjectContentDir() / TEXT("Data/itemdb-atlas.png");
	if (!FPaths::FileExists(AtlasPath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[chuckItemDB] atlas not found at %s"), *AtlasPath);
		return;
	}

	AtlasTexture = FImageUtils::ImportFileAsTexture2D(AtlasPath);
	if (!AtlasTexture)
	{
		UE_LOG(LogTemp, Error, TEXT("[chuckItemDB] failed to import atlas %s"), *AtlasPath);
		return;
	}

	AtlasTexture->SRGB = true;
	AtlasTexture->UpdateResource();

	if (FTexturePlatformData* PD = AtlasTexture->GetPlatformData())
	{
		if (PD->Mips.Num() > 0)
		{
			FTexture2DMipMap& Mip = PD->Mips[0];
			AtlasW = Mip.SizeX;
			AtlasH = Mip.SizeY;
			if (const FColor* Src = (const FColor*)Mip.BulkData.LockReadOnly())
			{
				AtlasPixels.SetNumUninitialized(AtlasW * AtlasH);
				FMemory::Memcpy(AtlasPixels.GetData(), Src, AtlasPixels.Num() * sizeof(FColor));
				Mip.BulkData.Unlock();
			}
		}
	}

	AtlasBrush.SetResourceObject(AtlasTexture);
	AtlasBrush.ImageSize = FVector2D(AtlasTexture->GetSizeX(), AtlasTexture->GetSizeY());
	AtlasBrush.DrawAs = ESlateBrushDrawType::Image;

	if (FSlateApplication::IsInitialized())
	{
		AtlasResourceHandle = FSlateApplication::Get().GetRenderer()->GetResourceHandle(AtlasBrush);
	}

	UE_LOG(LogTemp, Warning, TEXT("[chuckItemDB] atlas loaded %dx%d"),
		AtlasTexture->GetSizeX(), AtlasTexture->GetSizeY());
}

void UchuckItemDB::GetIconUV(int32 ItemKey, FVector2D& OutUVTopLeft, FVector2D& OutUVBottomRight) const
{
	const float Stride = 1.0f / (float)AtlasGridSize;
	const int32 Idx = (ItemKey > 0) ? ItemKey : 0;
	const int32 Col = Idx % AtlasGridSize;
	const int32 Row = (Idx / AtlasGridSize) % AtlasGridSize;
	OutUVTopLeft     = FVector2D((float)Col * Stride,      (float)Row * Stride);
	OutUVBottomRight = FVector2D((float)(Col + 1) * Stride, (float)(Row + 1) * Stride);
}

void UchuckItemDB::Deinitialize()
{
	Items.Empty();
	ByKey.Empty();
	RefToKey.Empty();
	AtlasTexture = nullptr;
	AtlasResourceHandle = FSlateResourceHandle();
	Super::Deinitialize();
}

void UchuckItemDB::LoadFromJson(const FString& JsonText)
{
	FTCHARToUTF8 Utf8(*JsonText);
	yyjson_doc* Doc = yyjson_read(Utf8.Get(), Utf8.Length(), 0);
	if (!Doc)
	{
		UE_LOG(LogTemp, Warning, TEXT("[chuckItemDB] yyjson parse failed"));
		return;
	}

	yyjson_val* Root = yyjson_doc_get_root(Doc);
	yyjson_val* Arr  = yyjson_obj_get(Root, "items");
	if (!Arr || !yyjson_is_arr(Arr))
	{
		yyjson_doc_free(Doc);
		return;
	}

	const size_t Total = yyjson_arr_size(Arr);
	Items.Empty((int32)Total);
	RefToKey.Empty((int32)Total);

	int32 MaxKeyVal = 0;
	size_t Idx, N;
	yyjson_val* ItemVal;
	yyjson_arr_foreach(Arr, Idx, N, ItemVal)
	{
		FchuckItemDef Def;
		Def.Key           = IntFieldUtf8(ItemVal, "key", 0);
		Def.Ref           = FName(*StrFieldUtf8(ItemVal, "ref"));
		Def.Name          = StrFieldUtf8(ItemVal, "name");
		Def.Description   = StrFieldUtf8(ItemVal, "description");
		Def.Emoji         = StrFieldUtf8(ItemVal, "emoji");
		Def.bHasImg       = BoolFieldUtf8(ItemVal, "hasImg", false);
		Def.TypeFlags     = IntFieldUtf8(ItemVal, "typeFlags", 0);
		Def.MaxStack      = IntFieldUtf8(ItemVal, "maxStack", 1);
		Def.bStackable    = BoolFieldUtf8(ItemVal, "stackable", false);
		Def.BuyPrice      = IntFieldUtf8(ItemVal, "buyPrice", 0);
		Def.SellPrice     = IntFieldUtf8(ItemVal, "sellPrice", 0);
		Def.bConsumable   = BoolFieldUtf8(ItemVal, "consumable", false);
		Def.HealHP        = static_cast<float>(IntFieldUtf8(ItemVal, "healHP",    0));
		Def.RestoreMP     = static_cast<float>(IntFieldUtf8(ItemVal, "restoreMP", 0));
		Def.RestoreEP     = static_cast<float>(IntFieldUtf8(ItemVal, "restoreEP", 0));
		if (Def.bConsumable && Def.HealHP == 0.f && Def.RestoreMP == 0.f && Def.RestoreEP == 0.f)
		{
			const FString R = Def.Ref.ToString().ToLower();
			if      (R.Contains(TEXT("mana")))   Def.RestoreMP = 25.f;
			else if (R.Contains(TEXT("stam")) || R.Contains(TEXT("energy"))) Def.RestoreEP = 30.f;
			else                                  Def.HealHP    = 20.f;
		}

		if (yyjson_val* RV = yyjson_obj_get(ItemVal, "rarity"))
		{
			Def.Rarity = ParseRarity(yyjson_get_str(RV));
		}

		if (Def.Key <= 0 || Def.Ref.IsNone())
		{
			continue;
		}

		MaxKeyVal = FMath::Max(MaxKeyVal, Def.Key);
		Items.Add(Def);
	}

	ByKey.SetNum(MaxKeyVal + 1);
	for (const FchuckItemDef& Def : Items)
	{
		ByKey[Def.Key] = Def;
		RefToKey.Add(Def.Ref, Def.Key);
	}

	yyjson_doc_free(Doc);
}

const FchuckItemDef* UchuckItemDB::LookupByKey(int32 Key) const
{
	if (Key <= 0 || Key >= ByKey.Num())
	{
		return nullptr;
	}
	const FchuckItemDef& Def = ByKey[Key];
	return Def.IsValid() ? &Def : nullptr;
}

const FchuckItemDef* UchuckItemDB::LookupByRef(FName Ref) const
{
	if (const int32* KeyPtr = RefToKey.Find(Ref))
	{
		return LookupByKey(*KeyPtr);
	}
	return nullptr;
}

UTexture2D* UchuckItemDB::GetRadialDiscTexture()
{
	if (RadialDiscTex) return RadialDiscTex;

	constexpr int32 Size = 256;
	UTexture2D* T = UTexture2D::CreateTransient(Size, Size, PF_B8G8R8A8);
	if (!T) return nullptr;
	T->SRGB = false;
	T->Filter = TF_Bilinear;
	T->AddressX = TA_Clamp;
	T->AddressY = TA_Clamp;
	T->NeverStream = true;
	T->CompressionSettings = TC_VectorDisplacementmap;

	FTexture2DMipMap& Mip = T->GetPlatformData()->Mips[0];
	if (FColor* Pixels = (FColor*)Mip.BulkData.Lock(LOCK_READ_WRITE))
	{
		const float Center = Size * 0.5f;
		// Specular highlight position (upper-left quadrant, "light from top-left")
		const float HxNorm = -0.38f;
		const float HyNorm = -0.42f;
		const float HSigma = 0.18f;

		for (int32 Y = 0; Y < Size; ++Y)
		{
			for (int32 X = 0; X < Size; ++X)
			{
				const float dx = (X + 0.5f - Center) / Center;
				const float dy = (Y + 0.5f - Center) / Center;
				const float r2 = dx * dx + dy * dy;

				float A = 0.f;
				float R = 1.f, G = 1.f, B = 1.f;

				if (r2 < 1.f)
				{
					const float r = FMath::Sqrt(r2);
					// Faint inner fill (soft glass interior)
					const float Inner = FMath::Pow(FMath::Clamp(1.f - r / 0.78f, 0.f, 1.f), 1.6f) * 0.10f;
					// Smooth bright outer rim (Fresnel-like band)
					const float Rim   = FMath::Pow(FMath::Clamp((r - 0.72f) / 0.22f, 0.f, 1.f), 1.4f) *
					                    FMath::Pow(FMath::Clamp((0.99f - r) / 0.27f, 0.f, 1.f), 0.8f) * 0.95f;
					// Specular highlight bright spot
					const float Hx = dx - HxNorm;
					const float Hy = dy - HyNorm;
					const float Hd2 = Hx * Hx + Hy * Hy;
					const float Spec = FMath::Exp(-Hd2 / (HSigma * HSigma)) * 0.85f;

					A = FMath::Min(1.f, Inner + Rim + Spec);

					// Slight cool tint on the rim (looks more glass-like)
					const float RimMix = FMath::Clamp(Rim * 1.5f, 0.f, 1.f);
					R = FMath::Lerp(1.f, 0.78f, RimMix);
					G = FMath::Lerp(1.f, 0.92f, RimMix);
					B = 1.f;
				}

				FColor& C = Pixels[Y * Size + X];
				C.R = (uint8)FMath::Clamp(R * 255.f, 0.f, 255.f);
				C.G = (uint8)FMath::Clamp(G * 255.f, 0.f, 255.f);
				C.B = (uint8)FMath::Clamp(B * 255.f, 0.f, 255.f);
				C.A = (uint8)FMath::Clamp(A * 255.f, 0.f, 255.f);
			}
		}
		Mip.BulkData.Unlock();
	}
	T->UpdateResource();
	RadialDiscTex = T;
	return T;
}

UMaterialInterface* UchuckItemDB::GetTranslucentBillboardMaterial()
{
	if (TranslucentBillboardMat) return TranslucentBillboardMat;

#if WITH_EDITORONLY_DATA
	UMaterial* Mat = NewObject<UMaterial>(GetTransientPackage(), NAME_None, RF_Transient);
	if (!Mat) return nullptr;
	Mat->BlendMode = BLEND_Translucent;
	Mat->SetShadingModel(MSM_Unlit);
	Mat->TwoSided = true;

	UMaterialEditorOnlyData* ED = Mat->GetEditorOnlyData();
	if (!ED) { TranslucentBillboardMat = Mat; return Mat; }

	UMaterialExpressionTextureSampleParameter2D* TexSample = NewObject<UMaterialExpressionTextureSampleParameter2D>(Mat);
	TexSample->ParameterName = TEXT("Texture");
	TexSample->SamplerType   = SAMPLERTYPE_Color;
	ED->ExpressionCollection.Expressions.Add(TexSample);

	UMaterialExpressionVectorParameter* TintParam = NewObject<UMaterialExpressionVectorParameter>(Mat);
	TintParam->ParameterName = TEXT("Tint");
	TintParam->DefaultValue  = FLinearColor(1.f, 1.f, 1.f, 1.f);
	ED->ExpressionCollection.Expressions.Add(TintParam);

	UMaterialExpressionMultiply* MulRgb = NewObject<UMaterialExpressionMultiply>(Mat);
	MulRgb->A.Expression  = TexSample; MulRgb->A.OutputIndex = 0;
	MulRgb->B.Expression  = TintParam; MulRgb->B.OutputIndex = 0;
	ED->ExpressionCollection.Expressions.Add(MulRgb);

	UMaterialExpressionMultiply* MulAlpha = NewObject<UMaterialExpressionMultiply>(Mat);
	MulAlpha->A.Expression  = TexSample; MulAlpha->A.OutputIndex = 4;
	MulAlpha->B.Expression  = TintParam; MulAlpha->B.OutputIndex = 4;
	ED->ExpressionCollection.Expressions.Add(MulAlpha);

	ED->EmissiveColor.Expression  = MulRgb;
	ED->Opacity.Expression        = MulAlpha;

	Mat->PreEditChange(nullptr);
	Mat->PostEditChange();
	Mat->ForceRecompileForRendering();

	TranslucentBillboardMat = Mat;
	return Mat;
#else
	TranslucentBillboardMat = LoadObject<UMaterialInterface>(
		nullptr, TEXT("/Engine/EngineMaterials/EmissiveTexturedMaterial.EmissiveTexturedMaterial"));
	return TranslucentBillboardMat;
#endif
}

UTexture2D* UchuckItemDB::GetIconTexture(int32 ItemKey)
{
	if (TObjectPtr<UTexture2D>* Cached = IconTextureCache.Find(ItemKey))
	{
		return Cached->Get();
	}
	if (AtlasPixels.Num() == 0 || AtlasW == 0 || AtlasH == 0) return nullptr;

	FVector2D UVTL, UVBR;
	GetIconUV(ItemKey, UVTL, UVBR);
	const int32 X0 = FMath::Clamp(FMath::FloorToInt(UVTL.X * AtlasW), 0, AtlasW - 1);
	const int32 Y0 = FMath::Clamp(FMath::FloorToInt(UVTL.Y * AtlasH), 0, AtlasH - 1);
	const int32 X1 = FMath::Clamp(FMath::CeilToInt (UVBR.X * AtlasW), X0 + 1, AtlasW);
	const int32 Y1 = FMath::Clamp(FMath::CeilToInt (UVBR.Y * AtlasH), Y0 + 1, AtlasH);
	const int32 W  = X1 - X0;
	const int32 H  = Y1 - Y0;
	if (W <= 0 || H <= 0) return nullptr;

	UTexture2D* T = UTexture2D::CreateTransient(W, H, PF_B8G8R8A8);
	if (!T) return nullptr;
	T->SRGB     = true;
	T->Filter   = TF_Bilinear;
	T->AddressX = TA_Clamp;
	T->AddressY = TA_Clamp;
	T->NeverStream = true;
	T->CompressionSettings = TC_VectorDisplacementmap;

	FTexture2DMipMap& Mip = T->GetPlatformData()->Mips[0];
	if (FColor* Dst = (FColor*)Mip.BulkData.Lock(LOCK_READ_WRITE))
	{
		for (int32 Y = 0; Y < H; ++Y)
		{
			const FColor* SrcRow = AtlasPixels.GetData() + (Y0 + Y) * AtlasW + X0;
			FMemory::Memcpy(Dst + Y * W, SrcRow, W * sizeof(FColor));
		}

		// Alpha-aware RGB bleed: copy nearest opaque RGB into transparent pixels
		// so bilinear filtering doesn't pull black halo into icon edges.
		TArray<FColor> Snap;
		Snap.SetNumUninitialized(W * H);
		FMemory::Memcpy(Snap.GetData(), Dst, W * H * sizeof(FColor));

		const int32 Radius = 3;
		for (int32 Y = 0; Y < H; ++Y)
		{
			for (int32 X = 0; X < W; ++X)
			{
				if (Snap[Y * W + X].A >= 32) continue;
				int32 BestD2 = INT32_MAX;
				FColor BestC(0, 0, 0, 0);
				for (int32 Dy = -Radius; Dy <= Radius; ++Dy)
				{
					const int32 Ny = Y + Dy;
					if (Ny < 0 || Ny >= H) continue;
					for (int32 Dx = -Radius; Dx <= Radius; ++Dx)
					{
						const int32 Nx = X + Dx;
						if (Nx < 0 || Nx >= W) continue;
						const FColor& N = Snap[Ny * W + Nx];
						if (N.A < 128) continue;
						const int32 D2 = Dx * Dx + Dy * Dy;
						if (D2 < BestD2)
						{
							BestD2 = D2;
							BestC  = N;
						}
					}
				}
				if (BestD2 != INT32_MAX)
				{
					FColor& Out = Dst[Y * W + X];
					Out.R = BestC.R;
					Out.G = BestC.G;
					Out.B = BestC.B;
				}
			}
		}

		Mip.BulkData.Unlock();
	}
	T->UpdateResource();
	IconTextureCache.Add(ItemKey, T);
	return T;
}

UMaterialInstanceDynamic* UchuckItemDB::GetIconMID(int32 ItemKey)
{
	if (TObjectPtr<UMaterialInstanceDynamic>* Cached = IconMIDCache.Find(ItemKey))
	{
		return Cached->Get();
	}
	UMaterialInterface* Base = GetTranslucentBillboardMaterial();
	if (!Base) return nullptr;
	UTexture2D* Tex = GetIconTexture(ItemKey);
	if (!Tex) return nullptr;
	UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, this);
	if (!MID) return nullptr;
	MID->SetTextureParameterValue(TEXT("Texture"), Tex);
	MID->SetVectorParameterValue (TEXT("Tint"),    FLinearColor::White);
	IconMIDCache.Add(ItemKey, MID);
	return MID;
}

UMaterialInstanceDynamic* UchuckItemDB::GetHaloMID(EchuckItemRarity Rarity, const FLinearColor& RarityColor)
{
	const uint8 Key = (uint8)Rarity;
	if (TObjectPtr<UMaterialInstanceDynamic>* Cached = HaloMIDByRarity.Find(Key))
	{
		return Cached->Get();
	}
	UMaterialInterface* Base = GetTranslucentBillboardMaterial();
	if (!Base) return nullptr;
	UTexture2D* Disc = GetRadialDiscTexture();
	if (!Disc) return nullptr;
	UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, this);
	if (!MID) return nullptr;
	MID->SetTextureParameterValue(TEXT("Texture"), Disc);
	MID->SetVectorParameterValue (TEXT("Tint"), FLinearColor(RarityColor.R, RarityColor.G, RarityColor.B, 0.85f));
	HaloMIDByRarity.Add(Key, MID);
	return MID;
}
