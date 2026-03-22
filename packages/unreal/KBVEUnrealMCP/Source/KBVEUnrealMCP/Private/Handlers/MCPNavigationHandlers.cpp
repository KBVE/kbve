#include "Handlers/MCPNavigationHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "NavigationSystem.h"
#include "NavigationPath.h"

void FMCPNavigationHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("navigation.rebuild_navmesh"), &HandleRebuildNavmesh);
	Registry.RegisterHandler(TEXT("navigation.test_path"), &HandleTestPath);
	Registry.RegisterHandler(TEXT("navigation.get_info"), &HandleGetInfo);
}

void FMCPNavigationHandlers::HandleRebuildNavmesh(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	UNavigationSystemV1* NavSys = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World);
	if (!NavSys) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_NAV"), TEXT("No navigation system in world")); return; }

	NavSys->Build();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("rebuild_started"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPNavigationHandlers::HandleTestPath(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	UNavigationSystemV1* NavSys = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World);
	if (!NavSys) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_NAV"), TEXT("No navigation system in world")); return; }

	const TArray<TSharedPtr<FJsonValue>>* StartArr;
	const TArray<TSharedPtr<FJsonValue>>* EndArr;
	if (!Params->TryGetArrayField(TEXT("start"), StartArr) || StartArr->Num() < 3 ||
		!Params->TryGetArrayField(TEXT("end"), EndArr) || EndArr->Num() < 3)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'start' and 'end' [x,y,z] arrays required"));
		return;
	}

	FVector Start((*StartArr)[0]->AsNumber(), (*StartArr)[1]->AsNumber(), (*StartArr)[2]->AsNumber());
	FVector End((*EndArr)[0]->AsNumber(), (*EndArr)[1]->AsNumber(), (*EndArr)[2]->AsNumber());

	UNavigationPath* NavPath = NavSys->FindPathToLocationSynchronously(World, Start, End);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("path_found"), NavPath && NavPath->IsValid());

	if (NavPath && NavPath->IsValid())
	{
		Result->SetNumberField(TEXT("path_length"), NavPath->GetPathLength());
		TArray<TSharedPtr<FJsonValue>> Points;
		for (const FVector& P : NavPath->PathPoints)
		{
			TArray<TSharedPtr<FJsonValue>> Pt = { MakeShared<FJsonValueNumber>(P.X), MakeShared<FJsonValueNumber>(P.Y), MakeShared<FJsonValueNumber>(P.Z) };
			Points.Add(MakeShared<FJsonValueArray>(Pt));
		}
		Result->SetArrayField(TEXT("path_points"), Points);
	}

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPNavigationHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	UNavigationSystemV1* NavSys = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("nav_system_present"), NavSys != nullptr);
	if (NavSys)
	{
		Result->SetBoolField(TEXT("is_navigation_built"), NavSys->IsNavigationBuilt(World->GetWorldSettings()));
	}
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
