#include "Handlers/MCPLandscapeHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Landscape.h"
#include "LandscapeProxy.h"
#include "LandscapeInfo.h"
#include "LandscapeComponent.h"
#include "LandscapeEdit.h"
#include "EngineUtils.h"

void FMCPLandscapeHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("landscape.sculpt"), &HandleSculpt);
	// flatten, smooth, paint_layer use the same heightmap API but with
	// different blend modes — can be added later as variants of sculpt.
	Registry.RegisterHandler(TEXT("landscape.flatten"), MCPProtocolHelpers::MakeStub(TEXT("landscape.flatten")));
	Registry.RegisterHandler(TEXT("landscape.smooth"), MCPProtocolHelpers::MakeStub(TEXT("landscape.smooth")));
	Registry.RegisterHandler(TEXT("landscape.paint_layer"), MCPProtocolHelpers::MakeStub(TEXT("landscape.paint_layer")));
	Registry.RegisterHandler(TEXT("landscape.get_info"), &HandleGetInfo);
}

void FMCPLandscapeHandlers::HandleSculpt(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	// Find the landscape
	ALandscapeProxy* Landscape = nullptr;
	FString LandscapeName = Params->GetStringField(TEXT("landscape_name"));
	for (TActorIterator<ALandscapeProxy> It(World); It; ++It)
	{
		if (LandscapeName.IsEmpty() || It->GetActorLabel() == LandscapeName || It->GetName() == LandscapeName)
		{
			Landscape = *It;
			break;
		}
	}

	if (!Landscape)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("No landscape found in the level"));
		return;
	}

	// Get sculpt parameters
	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 2)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y] array is required"));
		return;
	}

	double CenterX = (*CenterArr)[0]->AsNumber();
	double CenterY = (*CenterArr)[1]->AsNumber();
	double Radius = Params->GetNumberField(TEXT("radius"));
	double Strength = Params->GetNumberField(TEXT("strength"));

	if (Radius <= 0) Radius = 500.0;
	if (Strength == 0) Strength = 100.0;

	// Use the landscape edit data interface to modify heightmap
	ULandscapeInfo* LandscapeInfo = Landscape->GetLandscapeInfo();
	if (!LandscapeInfo)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_INFO"), TEXT("Landscape has no LandscapeInfo"));
		return;
	}

	// Calculate the region to modify in landscape-local coordinates
	FVector LandscapePos = Landscape->GetActorLocation();
	FVector LandscapeScale = Landscape->GetActorScale3D();

	int32 MinX = FMath::FloorToInt((CenterX - Radius - LandscapePos.X) / LandscapeScale.X);
	int32 MaxX = FMath::CeilToInt((CenterX + Radius - LandscapePos.X) / LandscapeScale.X);
	int32 MinY = FMath::FloorToInt((CenterY - Radius - LandscapePos.Y) / LandscapeScale.Y);
	int32 MaxY = FMath::CeilToInt((CenterY + Radius - LandscapePos.Y) / LandscapeScale.Y);

	FLandscapeEditDataInterface EditData(LandscapeInfo);
	TArray<uint16> HeightData;
	int32 Width = MaxX - MinX + 1;
	int32 Height = MaxY - MinY + 1;

	if (Width <= 0 || Height <= 0)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_REGION"), TEXT("Sculpt region is empty"));
		return;
	}

	HeightData.SetNumUninitialized(Width * Height);
	EditData.GetHeightDataFast(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0);

	// Apply radial sculpt
	int32 ModifiedCount = 0;
	for (int32 Y = MinY; Y <= MaxY; Y++)
	{
		for (int32 X = MinX; X <= MaxX; X++)
		{
			double WorldX = X * LandscapeScale.X + LandscapePos.X;
			double WorldY = Y * LandscapeScale.Y + LandscapePos.Y;
			double Dist = FMath::Sqrt(FMath::Square(WorldX - CenterX) + FMath::Square(WorldY - CenterY));

			if (Dist <= Radius)
			{
				double Falloff = 1.0 - (Dist / Radius);
				Falloff = FMath::Square(Falloff); // Smooth falloff
				int32 Idx = (Y - MinY) * Width + (X - MinX);
				int32 Delta = FMath::RoundToInt(Strength * Falloff);
				HeightData[Idx] = FMath::Clamp((int32)HeightData[Idx] + Delta, 0, 65535);
				ModifiedCount++;
			}
		}
	}

	EditData.SetHeightData(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("landscape"), Landscape->GetActorLabel());
	Result->SetNumberField(TEXT("modified_vertices"), ModifiedCount);
	Result->SetNumberField(TEXT("radius"), Radius);
	Result->SetNumberField(TEXT("strength"), Strength);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLandscapeHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Landscapes;
	for (TActorIterator<ALandscapeProxy> It(World); It; ++It)
	{
		ALandscapeProxy* Proxy = *It;
		TSharedPtr<FJsonObject> L = MakeShared<FJsonObject>();
		L->SetStringField(TEXT("name"), Proxy->GetName());
		L->SetStringField(TEXT("label"), Proxy->GetActorLabel());
		L->SetStringField(TEXT("class"), Proxy->GetClass()->GetName());

		FVector Origin, Extent;
		Proxy->GetActorBounds(false, Origin, Extent);
		L->SetArrayField(TEXT("origin"), { MakeShared<FJsonValueNumber>(Origin.X), MakeShared<FJsonValueNumber>(Origin.Y), MakeShared<FJsonValueNumber>(Origin.Z) });
		L->SetArrayField(TEXT("extent"), { MakeShared<FJsonValueNumber>(Extent.X), MakeShared<FJsonValueNumber>(Extent.Y), MakeShared<FJsonValueNumber>(Extent.Z) });

		L->SetNumberField(TEXT("component_count"), Proxy->LandscapeComponents.Num());

		Landscapes.Add(MakeShared<FJsonValueObject>(L));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("landscapes"), Landscapes);
	Result->SetNumberField(TEXT("count"), Landscapes.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
