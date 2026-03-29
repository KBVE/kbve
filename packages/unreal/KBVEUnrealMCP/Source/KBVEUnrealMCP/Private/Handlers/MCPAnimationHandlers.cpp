#include "Handlers/MCPAnimationHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimBlueprint.h"
#include "Animation/Skeleton.h"
#include "Animation/AnimNotifies/AnimNotify.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Factories/AnimBlueprintFactory.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Components/SkeletalMeshComponent.h"
#include "EngineUtils.h"

void FMCPAnimationHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("animation.create_anim_bp"), &HandleCreateAnimBP);
	// State machine editing requires deep AnimGraph node manipulation
	Registry.RegisterHandler(TEXT("animation.add_state"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_state")));
	Registry.RegisterHandler(TEXT("animation.add_transition"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_transition")));
	Registry.RegisterHandler(TEXT("animation.set_sequence"), &HandleSetSequence);
	Registry.RegisterHandler(TEXT("animation.get_tracks"), &HandleGetTracks);
	Registry.RegisterHandler(TEXT("animation.add_notify"), &HandleAddNotify);

	// TODO: ChiR24+UnrealClaude — state machines and skeletal systems
	Registry.RegisterHandler(TEXT("animation.create_state_machine"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_state_machine")));
	Registry.RegisterHandler(TEXT("animation.create_control_rig"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_control_rig")));
	Registry.RegisterHandler(TEXT("animation.manage_skeleton"), MCPProtocolHelpers::MakeStub(TEXT("animation.manage_skeleton")));
	Registry.RegisterHandler(TEXT("animation.create_montage"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_montage")));
	Registry.RegisterHandler(TEXT("animation.set_ik"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_ik")));

	// TODO: BlueprintMCP+UnrealClaude — blend spaces and transitions
	Registry.RegisterHandler(TEXT("animation.create_blend_space"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_blend_space")));
	Registry.RegisterHandler(TEXT("animation.set_blend_space_samples"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_blend_space_samples")));
	Registry.RegisterHandler(TEXT("animation.create_aim_offset"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_aim_offset")));
	Registry.RegisterHandler(TEXT("animation.set_transition_rule"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_transition_rule")));
	Registry.RegisterHandler(TEXT("animation.add_condition_node"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_condition_node")));
	Registry.RegisterHandler(TEXT("animation.list_anim_slots"), MCPProtocolHelpers::MakeStub(TEXT("animation.list_anim_slots")));
	Registry.RegisterHandler(TEXT("animation.list_sync_groups"), MCPProtocolHelpers::MakeStub(TEXT("animation.list_sync_groups")));
	Registry.RegisterHandler(TEXT("animation.validate"), MCPProtocolHelpers::MakeStub(TEXT("animation.validate")));
	// TODO: UnrealClaude — batch and state animation
	Registry.RegisterHandler(TEXT("animation.batch_operations"), MCPProtocolHelpers::MakeStub(TEXT("animation.batch_operations")));
	Registry.RegisterHandler(TEXT("animation.set_state_animation"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_state_animation")));
	Registry.RegisterHandler(TEXT("animation.find_animations"), MCPProtocolHelpers::MakeStub(TEXT("animation.find_animations")));
}

void FMCPAnimationHandlers::HandleCreateAnimBP(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString SkeletonPath = Params->GetStringField(TEXT("skeleton_path"));
	FString Path = Params->GetStringField(TEXT("path"));

	if (Name.IsEmpty() || SkeletonPath.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' and 'skeleton_path' are required"));
		return;
	}
	if (Path.IsEmpty()) Path = TEXT("/Game/Animations");

	USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *SkeletonPath);
	if (!Skeleton)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Skeleton not found: %s"), *SkeletonPath));
		return;
	}

	UAnimBlueprintFactory* Factory = NewObject<UAnimBlueprintFactory>();
	Factory->TargetSkeleton = Skeleton;
	Factory->ParentClass = UAnimInstance::StaticClass();

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UAnimBlueprint::StaticClass(), Factory);

	if (!Asset)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create animation blueprint"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Asset->GetName());
	Result->SetStringField(TEXT("path"), Asset->GetPathName());
	Result->SetStringField(TEXT("skeleton"), Skeleton->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAnimationHandlers::HandleSetSequence(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString ActorName = Params->GetStringField(TEXT("actor_name"));
	FString AnimPath = Params->GetStringField(TEXT("animation_path"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == ActorName || It->GetName() == ActorName) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *ActorName)); return; }

	USkeletalMeshComponent* SkelComp = Actor->FindComponentByClass<USkeletalMeshComponent>();
	if (!SkelComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_SKELETAL_MESH"), TEXT("Actor has no skeletal mesh component")); return; }

	UAnimSequence* Anim = LoadObject<UAnimSequence>(nullptr, *AnimPath);
	if (!Anim) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Animation not found: %s"), *AnimPath)); return; }

	SkelComp->PlayAnimation(Anim, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("animation"), Anim->GetName());
	Result->SetBoolField(TEXT("playing"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAnimationHandlers::HandleAddNotify(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AnimPath = Params->GetStringField(TEXT("animation_path"));
	FString NotifyName = Params->GetStringField(TEXT("notify_name"));
	double TriggerTime = Params->GetNumberField(TEXT("trigger_time"));

	if (AnimPath.IsEmpty() || NotifyName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'animation_path' and 'notify_name' are required"));
		return;
	}

	UAnimSequence* Anim = LoadObject<UAnimSequence>(nullptr, *AnimPath);
	if (!Anim)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Animation not found: %s"), *AnimPath));
		return;
	}

	FAnimNotifyEvent NewNotify;
	NewNotify.NotifyName = FName(*NotifyName);
	NewNotify.SetTime((float)TriggerTime);
	NewNotify.TriggerTimeOffset = 0.0f;

	Anim->Notifies.Add(NewNotify);
	Anim->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("animation"), Anim->GetName());
	Result->SetStringField(TEXT("notify_name"), NotifyName);
	Result->SetNumberField(TEXT("trigger_time"), TriggerTime);
	Result->SetNumberField(TEXT("total_notifies"), Anim->Notifies.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAnimationHandlers::HandleGetTracks(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AnimPath = Params->GetStringField(TEXT("animation_path"));
	if (AnimPath.IsEmpty())
	{
		IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();
		FARFilter Filter;
		Filter.ClassPaths.Add(UAnimSequence::StaticClass()->GetClassPathName());
		TArray<FAssetData> Anims;
		AssetRegistry.GetAssets(Filter, Anims);

		TArray<TSharedPtr<FJsonValue>> AnimArr;
		int32 Max = 100;
		for (const FAssetData& A : Anims)
		{
			TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
			Obj->SetStringField(TEXT("name"), A.AssetName.ToString());
			Obj->SetStringField(TEXT("path"), A.GetObjectPathString());
			AnimArr.Add(MakeShared<FJsonValueObject>(Obj));
			if (--Max <= 0) break;
		}

		TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
		Result->SetArrayField(TEXT("animations"), AnimArr);
		Result->SetNumberField(TEXT("count"), AnimArr.Num());
		MCPProtocolHelpers::Succeed(OnComplete, Result);
		return;
	}

	UAnimSequence* Anim = LoadObject<UAnimSequence>(nullptr, *AnimPath);
	if (!Anim)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Animation not found: %s"), *AnimPath));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Anim->GetName());
	Result->SetStringField(TEXT("path"), Anim->GetPathName());
	Result->SetNumberField(TEXT("duration"), Anim->GetPlayLength());
	Result->SetNumberField(TEXT("num_frames"), Anim->GetNumberOfSampledKeys());
	Result->SetNumberField(TEXT("frame_rate"), Anim->GetSamplingFrameRate().AsDecimal());

	TArray<TSharedPtr<FJsonValue>> Notifies;
	for (const FAnimNotifyEvent& Notify : Anim->Notifies)
	{
		TSharedPtr<FJsonObject> N = MakeShared<FJsonObject>();
		N->SetStringField(TEXT("name"), Notify.NotifyName.ToString());
		N->SetNumberField(TEXT("trigger_time"), Notify.GetTriggerTime());
		N->SetNumberField(TEXT("duration"), Notify.GetDuration());
		Notifies.Add(MakeShared<FJsonValueObject>(N));
	}
	Result->SetArrayField(TEXT("notifies"), Notifies);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
