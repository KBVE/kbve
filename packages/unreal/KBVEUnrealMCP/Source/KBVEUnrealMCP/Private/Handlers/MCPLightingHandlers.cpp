#include "Handlers/MCPLightingHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Engine/PointLight.h"
#include "Engine/SpotLight.h"
#include "Engine/DirectionalLight.h"
#include "Components/LightComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "EngineUtils.h"

void FMCPLightingHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("lighting.spawn_light"), &HandleSpawnLight);
	Registry.RegisterHandler(TEXT("lighting.set_properties"), &HandleSetProperties);
	Registry.RegisterHandler(TEXT("lighting.build_lighting"), &HandleBuildLighting);
	Registry.RegisterHandler(TEXT("lighting.get_info"), &HandleGetInfo);

	// TODO: ChiR24 — global illumination and shadow settings
	Registry.RegisterHandler(TEXT("lighting.set_gi"), MCPProtocolHelpers::MakeStub(TEXT("lighting.set_gi")));
	Registry.RegisterHandler(TEXT("lighting.set_shadows"), MCPProtocolHelpers::MakeStub(TEXT("lighting.set_shadows")));

	// TODO: ChiR24 — lighting environment
	Registry.RegisterHandler(TEXT("lighting.set_exposure"), MCPProtocolHelpers::MakeStub(TEXT("lighting.set_exposure")));
	Registry.RegisterHandler(TEXT("lighting.set_ambient_occlusion"), MCPProtocolHelpers::MakeStub(TEXT("lighting.set_ambient_occlusion")));
	Registry.RegisterHandler(TEXT("lighting.setup_volumetric_fog"), MCPProtocolHelpers::MakeStub(TEXT("lighting.setup_volumetric_fog")));
}

void FMCPLightingHandlers::HandleSpawnLight(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString LightType = Params->GetStringField(TEXT("type")).ToLower();
	FVector Location = FVector::ZeroVector;
	FRotator Rotation = FRotator::ZeroRotator;

	const TArray<TSharedPtr<FJsonValue>>* Arr;
	if (Params->TryGetArrayField(TEXT("location"), Arr) && Arr->Num() >= 3)
		Location = FVector((*Arr)[0]->AsNumber(), (*Arr)[1]->AsNumber(), (*Arr)[2]->AsNumber());
	if (Params->TryGetArrayField(TEXT("rotation"), Arr) && Arr->Num() >= 3)
		Rotation = FRotator((*Arr)[0]->AsNumber(), (*Arr)[1]->AsNumber(), (*Arr)[2]->AsNumber());

	AActor* LightActor = nullptr;
	if (LightType == TEXT("spot"))
		LightActor = World->SpawnActor<ASpotLight>(Location, Rotation);
	else if (LightType == TEXT("directional"))
		LightActor = World->SpawnActor<ADirectionalLight>(Location, Rotation);
	else
		LightActor = World->SpawnActor<APointLight>(Location, Rotation);

	if (!LightActor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn light")); return; }

	FString Label = Params->GetStringField(TEXT("label"));
	if (!Label.IsEmpty()) LightActor->SetActorLabel(Label);

	ULightComponent* LightComp = LightActor->FindComponentByClass<ULightComponent>();
	if (LightComp)
	{
		double Intensity;
		if (Params->TryGetNumberField(TEXT("intensity"), Intensity))
			LightComp->SetIntensity((float)Intensity);

		const TArray<TSharedPtr<FJsonValue>>* ColorArr;
		if (Params->TryGetArrayField(TEXT("color"), ColorArr) && ColorArr->Num() >= 3)
			LightComp->SetLightColor(FLinearColor((float)(*ColorArr)[0]->AsNumber(), (float)(*ColorArr)[1]->AsNumber(), (float)(*ColorArr)[2]->AsNumber()));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), LightActor->GetName());
	Result->SetStringField(TEXT("actor_label"), LightActor->GetActorLabel());
	Result->SetStringField(TEXT("light_type"), LightType.IsEmpty() ? TEXT("point") : LightType);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLightingHandlers::HandleSetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	ULightComponent* LightComp = Actor->FindComponentByClass<ULightComponent>();
	if (!LightComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_LIGHT"), TEXT("Actor has no light component")); return; }

	double Val;
	if (Params->TryGetNumberField(TEXT("intensity"), Val)) LightComp->SetIntensity((float)Val);

	const TArray<TSharedPtr<FJsonValue>>* ColorArr;
	if (Params->TryGetArrayField(TEXT("color"), ColorArr) && ColorArr->Num() >= 3)
		LightComp->SetLightColor(FLinearColor((float)(*ColorArr)[0]->AsNumber(), (float)(*ColorArr)[1]->AsNumber(), (float)(*ColorArr)[2]->AsNumber()));

	bool bShadows;
	if (Params->TryGetBoolField(TEXT("cast_shadows"), bShadows)) LightComp->SetCastShadows(bShadows);

	if (UPointLightComponent* PLC = Cast<UPointLightComponent>(LightComp))
		if (Params->TryGetNumberField(TEXT("attenuation_radius"), Val)) PLC->SetAttenuationRadius((float)Val);

	if (USpotLightComponent* SLC = Cast<USpotLightComponent>(LightComp))
	{
		if (Params->TryGetNumberField(TEXT("inner_cone_angle"), Val)) SLC->SetInnerConeAngle((float)Val);
		if (Params->TryGetNumberField(TEXT("outer_cone_angle"), Val)) SLC->SetOuterConeAngle((float)Val);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("light"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLightingHandlers::HandleBuildLighting(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	GEditor->Exec(World, TEXT("BUILD LIGHTING"));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("build_started"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLightingHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Lights;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		ULightComponent* LC = It->FindComponentByClass<ULightComponent>();
		if (!LC) continue;
		TSharedPtr<FJsonObject> L = MakeShared<FJsonObject>();
		L->SetStringField(TEXT("name"), It->GetName());
		L->SetStringField(TEXT("label"), It->GetActorLabel());
		L->SetStringField(TEXT("class"), It->GetClass()->GetName());
		L->SetNumberField(TEXT("intensity"), LC->Intensity);
		L->SetBoolField(TEXT("cast_shadows"), LC->CastShadows);
		FLinearColor C = LC->GetLightColor();
		L->SetArrayField(TEXT("color"), { MakeShared<FJsonValueNumber>(C.R), MakeShared<FJsonValueNumber>(C.G), MakeShared<FJsonValueNumber>(C.B) });
		Lights.Add(MakeShared<FJsonValueObject>(L));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("lights"), Lights);
	Result->SetNumberField(TEXT("count"), Lights.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
