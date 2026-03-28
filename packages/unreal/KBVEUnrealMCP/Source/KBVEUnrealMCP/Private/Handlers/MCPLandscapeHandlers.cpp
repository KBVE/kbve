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
	Registry.RegisterHandler(TEXT("landscape.flatten"), &HandleFlatten);
	Registry.RegisterHandler(TEXT("landscape.smooth"), &HandleSmooth);
	// paint_layer requires weight map manipulation with specific layer info
	Registry.RegisterHandler(TEXT("landscape.paint_layer"), MCPProtocolHelpers::MakeStub(TEXT("landscape.paint_layer")));
	Registry.RegisterHandler(TEXT("landscape.get_info"), &HandleGetInfo);

	// TODO: SpecialAgent — landscape material painting
	Registry.RegisterHandler(TEXT("landscape.paint_material"), MCPProtocolHelpers::MakeStub(TEXT("landscape.paint_material")));
}

ALandscapeProxy* FMCPLandscapeHandlers::FindLandscape(UWorld* World, const FString& Name)
{
	for (TActorIterator<ALandscapeProxy> It(World); It; ++It)
	{
		if (Name.IsEmpty() || It->GetActorLabel() == Name || It->GetName() == Name)
			return *It;
	}
	return nullptr;
}

void FMCPLandscapeHandlers::HandleSculpt(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	ALandscapeProxy* Landscape = FindLandscape(World, Params->GetStringField(TEXT("landscape_name")));
	if (!Landscape) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("No landscape found")); return; }

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 2)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y] required")); return; }

	double CenterX = (*CenterArr)[0]->AsNumber(), CenterY = (*CenterArr)[1]->AsNumber();
	double Radius = Params->GetNumberField(TEXT("radius"));
	double Strength = Params->GetNumberField(TEXT("strength"));
	if (Radius <= 0) Radius = 500.0;
	if (Strength == 0) Strength = 100.0;

	ULandscapeInfo* Info = Landscape->GetLandscapeInfo();
	if (!Info) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_INFO"), TEXT("No LandscapeInfo")); return; }

	FVector Pos = Landscape->GetActorLocation(), Scale = Landscape->GetActorScale3D();
	int32 MinX = FMath::FloorToInt((CenterX - Radius - Pos.X) / Scale.X);
	int32 MaxX = FMath::CeilToInt((CenterX + Radius - Pos.X) / Scale.X);
	int32 MinY = FMath::FloorToInt((CenterY - Radius - Pos.Y) / Scale.Y);
	int32 MaxY = FMath::CeilToInt((CenterY + Radius - Pos.Y) / Scale.Y);
	int32 Width = MaxX - MinX + 1, Height = MaxY - MinY + 1;
	if (Width <= 0 || Height <= 0) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_REGION"), TEXT("Region empty")); return; }

	FLandscapeEditDataInterface EditData(Info);
	TArray<uint16> HeightData;
	HeightData.SetNumUninitialized(Width * Height);
	EditData.GetHeightDataFast(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0);

	int32 ModifiedCount = 0;
	for (int32 Y = MinY; Y <= MaxY; Y++)
	{
		for (int32 X = MinX; X <= MaxX; X++)
		{
			double WorldX = X * Scale.X + Pos.X, WorldY = Y * Scale.Y + Pos.Y;
			double Dist = FMath::Sqrt(FMath::Square(WorldX - CenterX) + FMath::Square(WorldY - CenterY));
			if (Dist <= Radius)
			{
				double Falloff = FMath::Square(1.0 - Dist / Radius);
				int32 Idx = (Y - MinY) * Width + (X - MinX);
				HeightData[Idx] = FMath::Clamp((int32)HeightData[Idx] + FMath::RoundToInt(Strength * Falloff), 0, 65535);
				ModifiedCount++;
			}
		}
	}
	EditData.SetHeightData(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("landscape"), Landscape->GetActorLabel());
	Result->SetStringField(TEXT("operation"), TEXT("sculpt"));
	Result->SetNumberField(TEXT("modified_vertices"), ModifiedCount);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLandscapeHandlers::HandleFlatten(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	ALandscapeProxy* Landscape = FindLandscape(World, Params->GetStringField(TEXT("landscape_name")));
	if (!Landscape) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("No landscape found")); return; }

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 2)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y] required")); return; }

	double CenterX = (*CenterArr)[0]->AsNumber(), CenterY = (*CenterArr)[1]->AsNumber();
	double Radius = Params->GetNumberField(TEXT("radius"));
	double TargetHeight = Params->GetNumberField(TEXT("target_height"));
	if (Radius <= 0) Radius = 500.0;

	// Convert target height to uint16 landscape space (32768 = sea level)
	uint16 TargetH = (uint16)FMath::Clamp(FMath::RoundToInt(TargetHeight + 32768.0), 0, 65535);

	ULandscapeInfo* Info = Landscape->GetLandscapeInfo();
	if (!Info) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_INFO"), TEXT("No LandscapeInfo")); return; }

	FVector Pos = Landscape->GetActorLocation(), Scale = Landscape->GetActorScale3D();
	int32 MinX = FMath::FloorToInt((CenterX - Radius - Pos.X) / Scale.X);
	int32 MaxX = FMath::CeilToInt((CenterX + Radius - Pos.X) / Scale.X);
	int32 MinY = FMath::FloorToInt((CenterY - Radius - Pos.Y) / Scale.Y);
	int32 MaxY = FMath::CeilToInt((CenterY + Radius - Pos.Y) / Scale.Y);
	int32 Width = MaxX - MinX + 1, Height = MaxY - MinY + 1;
	if (Width <= 0 || Height <= 0) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_REGION"), TEXT("Region empty")); return; }

	FLandscapeEditDataInterface EditData(Info);
	TArray<uint16> HeightData;
	HeightData.SetNumUninitialized(Width * Height);
	EditData.GetHeightDataFast(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0);

	int32 ModifiedCount = 0;
	for (int32 Y = MinY; Y <= MaxY; Y++)
	{
		for (int32 X = MinX; X <= MaxX; X++)
		{
			double WorldX = X * Scale.X + Pos.X, WorldY = Y * Scale.Y + Pos.Y;
			double Dist = FMath::Sqrt(FMath::Square(WorldX - CenterX) + FMath::Square(WorldY - CenterY));
			if (Dist <= Radius)
			{
				double Falloff = FMath::Square(1.0 - Dist / Radius);
				int32 Idx = (Y - MinY) * Width + (X - MinX);
				int32 Current = HeightData[Idx];
				HeightData[Idx] = (uint16)FMath::Lerp((double)Current, (double)TargetH, Falloff);
				ModifiedCount++;
			}
		}
	}
	EditData.SetHeightData(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("landscape"), Landscape->GetActorLabel());
	Result->SetStringField(TEXT("operation"), TEXT("flatten"));
	Result->SetNumberField(TEXT("modified_vertices"), ModifiedCount);
	Result->SetNumberField(TEXT("target_height"), TargetHeight);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLandscapeHandlers::HandleSmooth(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	ALandscapeProxy* Landscape = FindLandscape(World, Params->GetStringField(TEXT("landscape_name")));
	if (!Landscape) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("No landscape found")); return; }

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 2)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y] required")); return; }

	double CenterX = (*CenterArr)[0]->AsNumber(), CenterY = (*CenterArr)[1]->AsNumber();
	double Radius = Params->GetNumberField(TEXT("radius"));
	double Strength = Params->GetNumberField(TEXT("strength"));
	if (Radius <= 0) Radius = 500.0;
	if (Strength <= 0 || Strength > 1.0) Strength = 0.5;

	ULandscapeInfo* Info = Landscape->GetLandscapeInfo();
	if (!Info) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_INFO"), TEXT("No LandscapeInfo")); return; }

	FVector Pos = Landscape->GetActorLocation(), Scale = Landscape->GetActorScale3D();
	// Expand region by 1 for neighbor sampling
	int32 MinX = FMath::FloorToInt((CenterX - Radius - Pos.X) / Scale.X) - 1;
	int32 MaxX = FMath::CeilToInt((CenterX + Radius - Pos.X) / Scale.X) + 1;
	int32 MinY = FMath::FloorToInt((CenterY - Radius - Pos.Y) / Scale.Y) - 1;
	int32 MaxY = FMath::CeilToInt((CenterY + Radius - Pos.Y) / Scale.Y) + 1;
	int32 Width = MaxX - MinX + 1, Height = MaxY - MinY + 1;
	if (Width <= 2 || Height <= 2) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_REGION"), TEXT("Region too small")); return; }

	FLandscapeEditDataInterface EditData(Info);
	TArray<uint16> HeightData, SmoothedData;
	HeightData.SetNumUninitialized(Width * Height);
	SmoothedData.SetNumUninitialized(Width * Height);
	EditData.GetHeightDataFast(MinX, MinY, MaxX, MaxY, HeightData.GetData(), 0);
	FMemory::Memcpy(SmoothedData.GetData(), HeightData.GetData(), Width * Height * sizeof(uint16));

	int32 ModifiedCount = 0;
	for (int32 Y = MinY + 1; Y < MaxY; Y++)
	{
		for (int32 X = MinX + 1; X < MaxX; X++)
		{
			double WorldX = X * Scale.X + Pos.X, WorldY = Y * Scale.Y + Pos.Y;
			double Dist = FMath::Sqrt(FMath::Square(WorldX - CenterX) + FMath::Square(WorldY - CenterY));
			if (Dist <= Radius)
			{
				int32 Idx = (Y - MinY) * Width + (X - MinX);
				// Average of 4 neighbors
				double Avg = ((double)HeightData[Idx - 1] + HeightData[Idx + 1] +
					HeightData[Idx - Width] + HeightData[Idx + Width]) * 0.25;
				double Falloff = FMath::Square(1.0 - Dist / Radius) * Strength;
				SmoothedData[Idx] = (uint16)FMath::Lerp((double)HeightData[Idx], Avg, Falloff);
				ModifiedCount++;
			}
		}
	}
	EditData.SetHeightData(MinX, MinY, MaxX, MaxY, SmoothedData.GetData(), 0, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("landscape"), Landscape->GetActorLabel());
	Result->SetStringField(TEXT("operation"), TEXT("smooth"));
	Result->SetNumberField(TEXT("modified_vertices"), ModifiedCount);
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
