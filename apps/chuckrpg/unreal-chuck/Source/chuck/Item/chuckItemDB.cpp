#include "chuckItemDB.h"

#include "Engine/Texture2D.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformFileManager.h"
#include "ImageUtils.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Rendering/SlateRenderer.h"

#include "KBVEYYJson.h"

namespace
{
	// MDX-sourced atlas-bearing refs. Codegen drops `img` from the JSON
	// (ASTRO_ONLY in gen-itemdb-data.mjs) so chuck can't infer atlas
	// coverage from the data file directly. Hardcoded mirror of the
	// refs whose MDX defines an `img:` frontmatter — keep in sync with
	// `grep -l '^img:' apps/kbve/astro-kbve/src/content/docs/itemdb/`.
	// Replace once codegen emits a `hasImg` boolean.
	static const TArray<FName> ImgRefs = {
		FName("alchemist-stardust"),
		FName("anime-body-pillow"),
		FName("auto-cooker-9000"),
		FName("beer"),
		FName("blue-shark"),
		FName("bone"),
		FName("brainrot-laptop"),
		FName("brown-curry-sauce"),
		FName("butter"),
		FName("cheddar-cheese"),
		FName("data-cd"),
		FName("ecto-cooler-drank-type-95"),
		FName("eds-jelly-jam"),
		FName("fresh-milk"),
		FName("fried-fish-taco"),
		FName("frozen-pizza-rolls"),
		FName("garlic-bread"),
		FName("gin"),
		FName("gravity-boots"),
		FName("green-pasta-sauce"),
		FName("grilled-fish-burrito"),
		FName("herbal-medi-wrap"),
		FName("holographic-arcade-token"),
		FName("index"),
		FName("ink-pasta-sauce"),
		FName("jar-of-honey"),
		FName("jareds-teddy-bear"),
		FName("kiwi-jigsaw"),
		FName("krispee-air-fryer"),
		FName("kryptonite-book"),
		FName("lobster"),
		FName("lobster-soup"),
		FName("lunar-lantern"),
		FName("magic-nemo"),
		FName("microchip-motherboard"),
		FName("natural-beeswax"),
		FName("noodles-girthy-pharma-potion"),
		FName("paradox-sack-of-potatoes"),
		FName("pied-piper-jacket"),
		FName("pocket-prophet-of-profit"),
		FName("portable-powerbank"),
		FName("propagandist-laptop"),
		FName("punk-skateboard"),
		FName("quantum-coffee"),
		FName("quantum-energy-drink"),
		FName("quick-toolbelt"),
		FName("rebel-radio"),
		FName("retro-crt-monitor"),
		FName("rubber-tire"),
		FName("salmon"),
		FName("spicy-nacho-supreme"),
		FName("spicy-ramen"),
		FName("spooky-skull-candle"),
		FName("steel-beehive"),
		FName("surfer-longboard"),
		FName("swiss-cheese"),
		FName("synthwave-popcorn"),
		FName("tex-mex-pizza"),
		FName("texas-bbq-brisket"),
		FName("tomato-pasta-sauce"),
		FName("undead-humanoid-skull"),
		FName("vampire-blood-champagne"),
		FName("vampire-blood-gelato"),
		FName("vhs-tape"),
		FName("vodka"),
		FName("vodka-sauce"),
		FName("z90-murderbot")
	};

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
		Def.Img           = StrFieldUtf8(ItemVal, "img");
		Def.TypeFlags     = IntFieldUtf8(ItemVal, "typeFlags", 0);
		Def.MaxStack      = IntFieldUtf8(ItemVal, "maxStack", 1);
		Def.bStackable    = BoolFieldUtf8(ItemVal, "stackable", false);
		Def.BuyPrice      = IntFieldUtf8(ItemVal, "buyPrice", 0);
		Def.SellPrice     = IntFieldUtf8(ItemVal, "sellPrice", 0);
		Def.bConsumable   = BoolFieldUtf8(ItemVal, "consumable", false);

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

	const TSet<FName> ImgSet(ImgRefs);
	for (FchuckItemDef& Def : Items)
	{
		if (ImgSet.Contains(Def.Ref))
		{
			Def.Img = TEXT("atlas");
			if (ByKey.IsValidIndex(Def.Key))
			{
				ByKey[Def.Key].Img = TEXT("atlas");
			}
		}
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
