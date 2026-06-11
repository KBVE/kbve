#include "chuckSettings.h"

#include "KBVESettingsStore.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "HAL/IConsoleManager.h"
#include "Misc/Paths.h"

namespace
{
	const FString GWindowScope   = TEXT("window");
	const FString GGraphicsScope = TEXT("graphics");

	void SetCVarInt(const TCHAR* Name, int32 Value)
	{
		if (IConsoleVariable* CVar = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			CVar->Set(Value, ECVF_SetByGameSetting);
		}
	}

	FString GeometryToValue(const FchuckWindowGeometry& G)
	{
		return FString::Printf(TEXT("%f,%f,%f,%f"), G.Position.X, G.Position.Y, G.Size.X, G.Size.Y);
	}

	bool ValueToGeometry(const FString& Value, FchuckWindowGeometry& Out)
	{
		TArray<FString> Parts;
		Value.ParseIntoArray(Parts, TEXT(","));
		if (Parts.Num() != 4) return false;
		Out.Position = FVector2D(FCString::Atod(*Parts[0]), FCString::Atod(*Parts[1]));
		Out.Size     = FVector2D(FCString::Atod(*Parts[2]), FCString::Atod(*Parts[3]));
		return true;
	}
}

UchuckSettings::UchuckSettings() = default;
UchuckSettings::~UchuckSettings() = default;

UchuckSettings* UchuckSettings::Get(const UObject* WorldContext)
{
	if (!WorldContext) return nullptr;
	UWorld* World = WorldContext->GetWorld();
	if (!World) return nullptr;
	UGameInstance* GI = World->GetGameInstance();
	return GI ? GI->GetSubsystem<UchuckSettings>() : nullptr;
}

void UchuckSettings::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Store = MakeUnique<FKBVESettingsStore>();
	const FString DbPath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("KBVE"), TEXT("settings.db"));
	Store->Open(DbPath);
	LoadAll();
	LoadGraphics();
	ApplyGraphics();
}

void UchuckSettings::Deinitialize()
{
	if (Store.IsValid())
	{
		Store->Close();
		Store.Reset();
	}
	WindowStates.Empty();
	Super::Deinitialize();
}

bool UchuckSettings::GetWindowGeometry(FName WindowKey, FchuckWindowGeometry& OutGeometry) const
{
	if (const FchuckWindowGeometry* Found = WindowStates.Find(WindowKey))
	{
		OutGeometry = *Found;
		return true;
	}
	return false;
}

void UchuckSettings::SetWindowGeometry(const FchuckWindowGeometry& InGeometry)
{
	WindowStates.FindOrAdd(InGeometry.WindowKey) = InGeometry;
	if (Store.IsValid())
	{
		Store->SetString(GWindowScope, InGeometry.WindowKey.ToString(), GeometryToValue(InGeometry));
	}
}

void UchuckSettings::LoadAll()
{
	if (!Store.IsValid()) return;
	TMap<FString, FString> Pairs;
	if (!Store->LoadScope(GWindowScope, Pairs)) return;
	for (const TPair<FString, FString>& Pair : Pairs)
	{
		FchuckWindowGeometry G;
		G.WindowKey = FName(*Pair.Key);
		if (ValueToGeometry(Pair.Value, G))
		{
			WindowStates.Add(G.WindowKey, G);
		}
	}
}

void UchuckSettings::SetGraphics(const FchuckGraphicsSettings& InGraphics, bool bApply)
{
	Graphics = InGraphics;
	SaveGraphics();
	if (bApply)
	{
		ApplyGraphics();
	}
}

void UchuckSettings::ResetGraphicsToDefaults(bool bApply)
{
	SetGraphics(FchuckGraphicsSettings(), bApply);
}

void UchuckSettings::LoadGraphics()
{
	if (!Store.IsValid()) return;

	bool  B = false;
	int64 I = 0;
	double F = 0.0;

	if (Store->GetBool (GGraphicsScope, TEXT("lumenGI"),          B)) Graphics.bLumenGI = B;
	if (Store->GetBool (GGraphicsScope, TEXT("lumenReflections"), B)) Graphics.bLumenReflections = B;
	if (Store->GetBool (GGraphicsScope, TEXT("vsm"),              B)) Graphics.bVirtualShadowMaps = B;
	if (Store->GetBool (GGraphicsScope, TEXT("rayTracing"),       B)) Graphics.bRayTracing = B;
	if (Store->GetBool (GGraphicsScope, TEXT("motionBlur"),       B)) Graphics.bMotionBlur = B;
	if (Store->GetBool (GGraphicsScope, TEXT("bloom"),            B)) Graphics.bBloom = B;
	if (Store->GetInt  (GGraphicsScope, TEXT("aa"),               I)) Graphics.AntiAliasing = (int32)I;
	if (Store->GetInt  (GGraphicsScope, TEXT("msaa"),             I)) Graphics.MSAASamples = (int32)I;
	if (Store->GetBool (GGraphicsScope, TEXT("vsync"),            B)) Graphics.bVSync = B;
	if (Store->GetFloat(GGraphicsScope, TEXT("resScale"),         F)) Graphics.ResolutionScale = (float)F;
	if (Store->GetInt  (GGraphicsScope, TEXT("fpsCap"),           I)) Graphics.FpsCap = (int32)I;
}

void UchuckSettings::SaveGraphics() const
{
	if (!Store.IsValid()) return;
	Store->SetBool (GGraphicsScope, TEXT("lumenGI"),          Graphics.bLumenGI);
	Store->SetBool (GGraphicsScope, TEXT("lumenReflections"), Graphics.bLumenReflections);
	Store->SetBool (GGraphicsScope, TEXT("vsm"),              Graphics.bVirtualShadowMaps);
	Store->SetBool (GGraphicsScope, TEXT("rayTracing"),       Graphics.bRayTracing);
	Store->SetBool (GGraphicsScope, TEXT("motionBlur"),       Graphics.bMotionBlur);
	Store->SetBool (GGraphicsScope, TEXT("bloom"),            Graphics.bBloom);
	Store->SetInt  (GGraphicsScope, TEXT("aa"),               Graphics.AntiAliasing);
	Store->SetInt  (GGraphicsScope, TEXT("msaa"),             Graphics.MSAASamples);
	Store->SetBool (GGraphicsScope, TEXT("vsync"),            Graphics.bVSync);
	Store->SetFloat(GGraphicsScope, TEXT("resScale"),         Graphics.ResolutionScale);
	Store->SetInt  (GGraphicsScope, TEXT("fpsCap"),           Graphics.FpsCap);
}

void UchuckSettings::ApplyGraphics() const
{
	SetCVarInt(TEXT("r.DynamicGlobalIlluminationMethod"), Graphics.bLumenGI ? 1 : 0);
	SetCVarInt(TEXT("r.ReflectionMethod"),                Graphics.bLumenReflections ? 1 : 0);
	SetCVarInt(TEXT("r.Shadow.Virtual.Enable"),           Graphics.bVirtualShadowMaps ? 1 : 0);
	SetCVarInt(TEXT("r.RayTracing"),                      Graphics.bRayTracing ? 1 : 0);
	SetCVarInt(TEXT("r.DefaultFeature.MotionBlur"),       Graphics.bMotionBlur ? 1 : 0);
	SetCVarInt(TEXT("r.DefaultFeature.Bloom"),            Graphics.bBloom ? 1 : 0);

	// r.AntiAliasingMethod: 0 None, 1 FXAA, 2 TAA, 4 TSR (our combo: 0/1/2/3->TSR).
	const int32 AAMethod = Graphics.AntiAliasing == 3 ? 4 : Graphics.AntiAliasing;
	SetCVarInt(TEXT("r.AntiAliasingMethod"), AAMethod);
	SetCVarInt(TEXT("r.MSAACount"), Graphics.MSAASamples > 0 ? Graphics.MSAASamples : 1);

	if (UGameUserSettings* GUS = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		GUS->SetVSyncEnabled(Graphics.bVSync);
		GUS->SetResolutionScaleNormalized(Graphics.ResolutionScale / 100.f);
		GUS->SetFrameRateLimit(Graphics.FpsCap > 0 ? (float)Graphics.FpsCap : 0.f);
		GUS->ApplySettings(false);
		GUS->SaveSettings();
	}
}
