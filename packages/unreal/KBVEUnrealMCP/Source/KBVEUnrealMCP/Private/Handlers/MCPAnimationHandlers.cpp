#include "Handlers/MCPAnimationHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Animation/AnimSequence.h"
#include "AssetRegistry/AssetRegistryModule.h"

void FMCPAnimationHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// AnimBP state machine editing requires deep AnimGraph API access;
	// these remain stubbed until properly wrapped.
	Registry.RegisterHandler(TEXT("animation.create_anim_bp"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_anim_bp")));
	Registry.RegisterHandler(TEXT("animation.add_state"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_state")));
	Registry.RegisterHandler(TEXT("animation.add_transition"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_transition")));
	Registry.RegisterHandler(TEXT("animation.set_sequence"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_sequence")));
	Registry.RegisterHandler(TEXT("animation.get_tracks"), &HandleGetTracks);
	Registry.RegisterHandler(TEXT("animation.add_notify"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_notify")));
}

void FMCPAnimationHandlers::HandleGetTracks(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AnimPath = Params->GetStringField(TEXT("animation_path"));
	if (AnimPath.IsEmpty())
	{
		// List all animation sequences in project
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
