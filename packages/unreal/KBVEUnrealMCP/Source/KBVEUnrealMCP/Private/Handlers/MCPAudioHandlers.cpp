#include "Handlers/MCPAudioHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Components/AudioComponent.h"
#include "Sound/AmbientSound.h"
#include "Sound/SoundBase.h"
#include "EngineUtils.h"

void FMCPAudioHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("audio.spawn_source"), &HandleSpawnSource);
	Registry.RegisterHandler(TEXT("audio.set_properties"), &HandleSetProperties);
	Registry.RegisterHandler(TEXT("audio.play"), &HandlePlay);
	Registry.RegisterHandler(TEXT("audio.stop"), &HandleStop);
	Registry.RegisterHandler(TEXT("audio.get_info"), &HandleGetInfo);

	// TODO: ChiR24 — sound cue and MetaSound creation
	Registry.RegisterHandler(TEXT("audio.create_sound_cue"), MCPProtocolHelpers::MakeStub(TEXT("audio.create_sound_cue")));
	Registry.RegisterHandler(TEXT("audio.create_metasound"), MCPProtocolHelpers::MakeStub(TEXT("audio.create_metasound")));
}

void FMCPAudioHandlers::HandleSpawnSource(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FVector Location = FVector::ZeroVector;
	const TArray<TSharedPtr<FJsonValue>>* LocArr;
	if (Params->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
		Location = FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber());

	AAmbientSound* SoundActor = World->SpawnActor<AAmbientSound>(Location, FRotator::ZeroRotator);
	if (!SoundActor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn ambient sound")); return; }

	FString Label = Params->GetStringField(TEXT("label"));
	if (!Label.IsEmpty()) SoundActor->SetActorLabel(Label);

	FString SoundPath = Params->GetStringField(TEXT("sound_asset"));
	if (!SoundPath.IsEmpty())
	{
		USoundBase* Sound = LoadObject<USoundBase>(nullptr, *SoundPath);
		if (Sound && SoundActor->GetAudioComponent())
			SoundActor->GetAudioComponent()->SetSound(Sound);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), SoundActor->GetName());
	Result->SetStringField(TEXT("actor_label"), SoundActor->GetActorLabel());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAudioHandlers::HandleSetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UAudioComponent* AudioComp = Actor->FindComponentByClass<UAudioComponent>();
	if (!AudioComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_AUDIO"), TEXT("Actor has no audio component")); return; }

	double Val;
	if (Params->TryGetNumberField(TEXT("volume"), Val)) AudioComp->SetVolumeMultiplier((float)Val);
	if (Params->TryGetNumberField(TEXT("pitch"), Val)) AudioComp->SetPitchMultiplier((float)Val);

	bool bAutoActivate;
	if (Params->TryGetBoolField(TEXT("auto_activate"), bAutoActivate)) AudioComp->SetAutoActivate(bAutoActivate);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAudioHandlers::HandlePlay(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UAudioComponent* AudioComp = Actor->FindComponentByClass<UAudioComponent>();
	if (!AudioComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_AUDIO"), TEXT("Actor has no audio component")); return; }

	AudioComp->Play();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("playing"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAudioHandlers::HandleStop(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UAudioComponent* AudioComp = Actor->FindComponentByClass<UAudioComponent>();
	if (!AudioComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_AUDIO"), TEXT("Actor has no audio component")); return; }

	AudioComp->Stop();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("stopped"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAudioHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Sources;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		UAudioComponent* AC = It->FindComponentByClass<UAudioComponent>();
		if (!AC) continue;
		TSharedPtr<FJsonObject> S = MakeShared<FJsonObject>();
		S->SetStringField(TEXT("name"), It->GetName());
		S->SetStringField(TEXT("label"), It->GetActorLabel());
		S->SetBoolField(TEXT("playing"), AC->IsPlaying());
		S->SetNumberField(TEXT("volume"), AC->VolumeMultiplier);
		S->SetNumberField(TEXT("pitch"), AC->PitchMultiplier);
		S->SetStringField(TEXT("sound"), AC->Sound ? AC->Sound->GetName() : TEXT("none"));
		Sources.Add(MakeShared<FJsonValueObject>(S));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("audio_sources"), Sources);
	Result->SetNumberField(TEXT("count"), Sources.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
