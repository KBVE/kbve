#include "UEDevOpsImportLibrary.h"

#include "AssetImportTask.h"
#include "AssetToolsModule.h"
#include "DesktopPlatformModule.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture2D.h"
#include "EditorAssetLibrary.h"
#include "Factories/FbxImportUI.h"
#include "Factories/FbxStaticMeshImportData.h"
#include "Factories/MaterialFactoryNew.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/FileManager.h"
#include "IDesktopPlatform.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "MaterialEditingLibrary.h"
#include "Misc/MessageDialog.h"
#include "Misc/Paths.h"

#define LOCTEXT_NAMESPACE "UEDevOpsImport"

namespace
{
	struct FTextureRule
	{
		TextureCompressionSettings Compression;
		bool                       bSrgb;
		EMaterialProperty          Slot;
		EMaterialSamplerType       Sampler;
	};

	struct FTextureSuffix
	{
		const TCHAR* Suffix;
		FTextureRule Rule;
	};

	const TArray<FTextureSuffix>& GetSuffixTable()
	{
		static const TArray<FTextureSuffix> Table = {
			{ TEXT("_BaseColor"), { TC_Default,   true,  MP_BaseColor,          SAMPLERTYPE_Color       } },
			{ TEXT("_Color"),     { TC_Default,   true,  MP_BaseColor,          SAMPLERTYPE_Color       } },
			{ TEXT("_Albedo"),    { TC_Default,   true,  MP_BaseColor,          SAMPLERTYPE_Color       } },
			{ TEXT("_Normal"),    { TC_Normalmap, false, MP_Normal,             SAMPLERTYPE_Normal      } },
			{ TEXT("_NormalF"),   { TC_Normalmap, false, MP_Normal,             SAMPLERTYPE_Normal      } },
			{ TEXT("_Metallic"),  { TC_Masks,     false, MP_Metallic,           SAMPLERTYPE_LinearColor } },
			{ TEXT("_Metalness"), { TC_Masks,     false, MP_Metallic,           SAMPLERTYPE_LinearColor } },
			{ TEXT("_Roughness"), { TC_Masks,     false, MP_Roughness,          SAMPLERTYPE_LinearColor } },
			{ TEXT("_AO"),        { TC_Masks,     false, MP_AmbientOcclusion,   SAMPLERTYPE_LinearColor } },
			{ TEXT("_Occlusion"), { TC_Masks,     false, MP_AmbientOcclusion,   SAMPLERTYPE_LinearColor } },
			{ TEXT("_Emission"),  { TC_Default,   false, MP_EmissiveColor,      SAMPLERTYPE_LinearColor } },
			{ TEXT("_Emissive"),  { TC_Default,   false, MP_EmissiveColor,      SAMPLERTYPE_LinearColor } },
		};
		return Table;
	}

	bool ClassifyTexture(const FString& Stem, FTextureRule& OutRule)
	{
		for (const FTextureSuffix& Entry : GetSuffixTable())
		{
			if (Stem.EndsWith(Entry.Suffix))
			{
				OutRule = Entry.Rule;
				return true;
			}
		}
		return false;
	}

	bool IsImage(const FString& Ext)
	{
		return Ext == TEXT(".png") || Ext == TEXT(".tga") || Ext == TEXT(".jpg")
		    || Ext == TEXT(".jpeg") || Ext == TEXT(".exr") || Ext == TEXT(".tif")
		    || Ext == TEXT(".tiff");
	}

	bool IsFbx(const FString& Ext)
	{
		return Ext == TEXT(".fbx");
	}

	UAssetImportTask* MakeTask(const FString& Filename, const FString& Dest)
	{
		UAssetImportTask* Task = NewObject<UAssetImportTask>();
		Task->Filename         = Filename;
		Task->DestinationPath  = Dest;
		Task->bReplaceExisting = true;
		Task->bAutomated       = true;
		Task->bSave            = true;
		return Task;
	}

	void ConfigureFbxTask(UAssetImportTask* Task)
	{
		UFbxImportUI* Options = NewObject<UFbxImportUI>();
		Options->bImportMesh       = true;
		Options->bImportTextures   = false;
		Options->bImportMaterials  = false;
		Options->bImportAsSkeletal = false;
		UFbxStaticMeshImportData* SMID = Options->StaticMeshImportData;
		SMID->bCombineMeshes          = true;
		SMID->bGenerateLightmapUVs    = true;
		SMID->bAutoGenerateCollision  = true;
		SMID->NormalImportMethod      = FBXNIM_ImportNormals;
		SMID->NormalGenerationMethod  = EFBXNormalGenerationMethod::MikkTSpace;
		SMID->bComputeWeightedNormals = true;
		Task->Options = Options;
	}

	UMaterial* BuildMaterial(const FString& MaterialName, const FString& Dest,
		const TMap<EMaterialProperty, TPair<UTexture*, EMaterialSamplerType>>& SlotToTexture)
	{
		const FString MatPath = Dest / FString::Printf(TEXT("M_%s"), *MaterialName);
		if (UEditorAssetLibrary::DoesAssetExist(MatPath))
		{
			UEditorAssetLibrary::DeleteAsset(MatPath);
		}

		IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
		UMaterialFactoryNew* Factory = NewObject<UMaterialFactoryNew>();
		UObject* NewAsset = AssetTools.CreateAsset(
			FString::Printf(TEXT("M_%s"), *MaterialName), Dest, UMaterial::StaticClass(), Factory);
		UMaterial* Mat = Cast<UMaterial>(NewAsset);
		if (!Mat)
		{
			UE_LOG(LogTemp, Error, TEXT("[UEDevOps] Failed to create material %s"), *MatPath);
			return nullptr;
		}

		int32 Y = -300;
		for (const auto& Kvp : SlotToTexture)
		{
			UMaterialExpression* Expr = UMaterialEditingLibrary::CreateMaterialExpression(
				Mat, UMaterialExpressionTextureSample::StaticClass(), -400, Y);
			UMaterialExpressionTextureSample* Sample = Cast<UMaterialExpressionTextureSample>(Expr);
			if (!Sample)
			{
				UE_LOG(LogTemp, Error, TEXT("[UEDevOps] CreateMaterialExpression returned null for %d"), (int32)Kvp.Key);
				continue;
			}

			Sample->SamplerType = Kvp.Value.Value;
			Sample->Texture     = Kvp.Value.Key;

			const bool bConnected = UMaterialEditingLibrary::ConnectMaterialProperty(Sample, TEXT("RGB"), Kvp.Key);
			UE_LOG(LogTemp, Display, TEXT("[UEDevOps]   wired %s -> slot %d (connected=%d, sampler=%d)"),
				*Kvp.Value.Key->GetName(), (int32)Kvp.Key, bConnected ? 1 : 0, (int32)Kvp.Value.Value);
			Y += 250;
		}

		UMaterialEditingLibrary::RecompileMaterial(Mat);
		UEditorAssetLibrary::SaveLoadedAsset(Mat);
		return Mat;
	}

	void AssignMaterialToMesh(UStaticMesh* Mesh, UMaterialInterface* Material)
	{
		if (!Mesh || !Material) return;
		FStaticMaterial Slot;
		Slot.MaterialInterface         = Material;
		Slot.MaterialSlotName          = TEXT("Default");
		Slot.ImportedMaterialSlotName  = TEXT("Default");
		TArray<FStaticMaterial> Slots = { Slot };
		Mesh->SetStaticMaterials(Slots);
		UEditorAssetLibrary::SaveLoadedAsset(Mesh);
		UE_LOG(LogTemp, Display, TEXT("[UEDevOps] Assigned %s -> %s"), *Material->GetName(), *Mesh->GetName());
	}
}

bool FUEDevOpsImportLibrary::ImportRawAssetFolder(const FString& SourceFolder, const FString& DestContentPath, const FString& MaterialName)
{
	const FString Source = FPaths::ConvertRelativePathToFull(SourceFolder);
	if (!IFileManager::Get().DirectoryExists(*Source))
	{
		UE_LOG(LogTemp, Error, TEXT("[UEDevOps] Source not a directory: %s"), *Source);
		return false;
	}
	const FString Dest = DestContentPath.TrimChar('/');
	const FString DestFull = FString::Printf(TEXT("/%s"), *Dest);

	UEditorAssetLibrary::MakeDirectory(DestFull);

	TArray<FString> Files;
	IFileManager::Get().FindFiles(Files, *(Source / TEXT("*")), true, false);
	Files.Sort();

	TArray<UAssetImportTask*> FbxTasks;
	TArray<UAssetImportTask*> TexTasks;
	TMap<FString, FTextureRule> TexRules;

	for (const FString& Filename : Files)
	{
		const FString Full = Source / Filename;
		FString Stem, Ext;
		FPaths::Split(Filename, Stem, Stem, Ext);
		Stem = FPaths::GetBaseFilename(Filename);
		Ext  = FString(TEXT(".")) + FPaths::GetExtension(Filename).ToLower();

		if (IsFbx(Ext))
		{
			UAssetImportTask* Task = MakeTask(Full, DestFull);
			ConfigureFbxTask(Task);
			FbxTasks.Add(Task);
		}
		else if (IsImage(Ext))
		{
			FTextureRule Rule;
			if (!ClassifyTexture(Stem, Rule))
			{
				UE_LOG(LogTemp, Warning, TEXT("[UEDevOps] Skipping unclassified texture: %s"), *Filename);
				continue;
			}
			UAssetImportTask* Task = MakeTask(Full, DestFull);
			TexTasks.Add(Task);
			TexRules.Add(Full, Rule);
		}
	}

	TArray<UAssetImportTask*> AllTasks;
	AllTasks.Append(FbxTasks);
	AllTasks.Append(TexTasks);
	if (AllTasks.Num() == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("[UEDevOps] No FBX or supported images in %s"), *Source);
		return false;
	}

	UE_LOG(LogTemp, Display, TEXT("[UEDevOps] Importing %d FBX + %d textures to %s"),
		FbxTasks.Num(), TexTasks.Num(), *DestFull);

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	AssetTools.ImportAssetTasks(AllTasks);

	TMap<EMaterialProperty, TPair<UTexture*, EMaterialSamplerType>> SlotToTexture;
	for (UAssetImportTask* Task : TexTasks)
	{
		const FTextureRule& Rule = TexRules.FindChecked(Task->Filename);
		for (const FString& AssetPath : Task->ImportedObjectPaths)
		{
			UTexture* Tex = Cast<UTexture>(UEditorAssetLibrary::LoadAsset(AssetPath));
			if (!Tex) continue;
			Tex->CompressionSettings = Rule.Compression;
			Tex->SRGB                = Rule.bSrgb;
			UEditorAssetLibrary::SaveLoadedAsset(Tex);
			if (!SlotToTexture.Contains(Rule.Slot))
			{
				SlotToTexture.Add(Rule.Slot, TPair<UTexture*, EMaterialSamplerType>(Tex, Rule.Sampler));
			}
		}
	}

	TArray<UStaticMesh*> Meshes;
	for (UAssetImportTask* Task : FbxTasks)
	{
		for (const FString& AssetPath : Task->ImportedObjectPaths)
		{
			if (UStaticMesh* Mesh = Cast<UStaticMesh>(UEditorAssetLibrary::LoadAsset(AssetPath)))
			{
				Meshes.Add(Mesh);
			}
		}
	}

	FString ResolvedMatName = MaterialName.IsEmpty() ? FPaths::GetCleanFilename(Source) : MaterialName;
	UMaterial* Mat = nullptr;
	if (SlotToTexture.Num() > 0)
	{
		Mat = BuildMaterial(ResolvedMatName, DestFull, SlotToTexture);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[UEDevOps] No texture suffixes classified — material skipped"));
	}

	if (Mat && Meshes.Num() == 1)
	{
		AssignMaterialToMesh(Meshes[0], Mat);
	}
	else if (Mat && Meshes.Num() > 1)
	{
		UE_LOG(LogTemp, Warning, TEXT("[UEDevOps] %d meshes imported — leaving material unassigned"), Meshes.Num());
	}

	UE_LOG(LogTemp, Display, TEXT("[UEDevOps] Import complete. Meshes=%d Material=%s"),
		Meshes.Num(), Mat ? *Mat->GetPathName() : TEXT("none"));
	return true;
}

void FUEDevOpsImportLibrary::PromptAndImport()
{
	IDesktopPlatform* Desktop = FDesktopPlatformModule::Get();
	if (!Desktop) return;

	const void* ParentWindow = FSlateApplication::Get().FindBestParentWindowHandleForDialogs(nullptr);

	FString SourceFolder;
	if (!Desktop->OpenDirectoryDialog(
			ParentWindow,
			TEXT("Pick a Raw asset folder (FBX + textures)"),
			FPaths::ProjectDir() / TEXT("Raw"),
			SourceFolder))
	{
		return;
	}

	const FString FolderName      = FPaths::GetCleanFilename(SourceFolder);
	const FString DestContentPath = FString::Printf(TEXT("/Game/Art/Furniture/%s"), *FolderName);
	const FString MaterialName    = FolderName;

	UE_LOG(LogTemp, Display, TEXT("[UEDevOps] Source=%s Dest=%s Material=%s"),
		*SourceFolder, *DestContentPath, *MaterialName);

	if (!ImportRawAssetFolder(SourceFolder, DestContentPath, MaterialName))
	{
		FMessageDialog::Open(EAppMsgType::Ok,
			LOCTEXT("ImportFailed", "Import failed. Check the Output Log."));
	}
}

#undef LOCTEXT_NAMESPACE
