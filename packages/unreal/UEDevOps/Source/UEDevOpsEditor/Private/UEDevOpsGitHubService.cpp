#include "UEDevOpsGitHubService.h"
#include "UEDevOpsSettings.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Framework/Application/SlateApplication.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SMultiLineEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SWindow.h"

static const FString GitHubAPIBase = TEXT("https://api.github.com");

bool UUEDevOpsGitHubService::GetGitHubConfig(FString& OutToken, FString& OutRepo)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || Settings->GitHubToken.IsEmpty() || Settings->GitHubRepository.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("UEDevOps: GitHub token or repository not configured in Project Settings > Plugins > UEDevOps"));
		return false;
	}
	OutToken = Settings->GitHubToken;
	OutRepo = Settings->GitHubRepository;
	return true;
}

FString UUEDevOpsGitHubService::BuildAPIURL(const FString& Repo, const FString& Endpoint)
{
	return FString::Printf(TEXT("%s/repos/%s/%s"), *GitHubAPIBase, *Repo, *Endpoint);
}

void UUEDevOpsGitHubService::CreateIssue(
	const FString& Title, const FString& Body,
	const TArray<FString>& Labels, const FOnGitHubIssueCreated& OnComplete)
{
	FString Token, Repo;
	if (!GetGitHubConfig(Token, Repo))
	{
		OnComplete.ExecuteIfBound(false, FDevOpsGitHubIssue());
		return;
	}

	TSharedPtr<FJsonObject> JsonBody = MakeShared<FJsonObject>();
	JsonBody->SetStringField(TEXT("title"), Title);
	JsonBody->SetStringField(TEXT("body"), Body);

	TArray<TSharedPtr<FJsonValue>> LabelArray;
	for (const FString& Label : Labels)
	{
		LabelArray.Add(MakeShared<FJsonValueString>(Label));
	}
	JsonBody->SetArrayField(TEXT("labels"), LabelArray);

	FString Content;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Content);
	FJsonSerializer::Serialize(JsonBody.ToSharedRef(), Writer);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BuildAPIURL(Repo, TEXT("issues")));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Accept"), TEXT("application/vnd.github+json"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Token));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(Content);

	Request->OnProcessRequestComplete().BindLambda(
		[OnComplete](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
		{
			FDevOpsGitHubIssue Issue;
			if (bSuccess && Resp.IsValid() && Resp->GetResponseCode() == 201)
			{
				TSharedPtr<FJsonObject> Json;
				TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
				if (FJsonSerializer::Deserialize(Reader, Json) && Json.IsValid())
				{
					Issue.Number = Json->GetIntegerField(TEXT("number"));
					Issue.Title = Json->GetStringField(TEXT("title"));
					Issue.State = Json->GetStringField(TEXT("state"));
					Issue.HTMLURL = Json->GetStringField(TEXT("html_url"));
				}
				OnComplete.ExecuteIfBound(true, Issue);
			}
			else
			{
				UE_LOG(LogTemp, Warning, TEXT("UEDevOps: Failed to create GitHub issue (code %d)"),
					Resp.IsValid() ? Resp->GetResponseCode() : 0);
				OnComplete.ExecuteIfBound(false, Issue);
			}
		});

	Request->ProcessRequest();
}

void UUEDevOpsGitHubService::ListIssues(int32 MaxResults, const FOnGitHubIssuesListed& OnComplete)
{
	FString Token, Repo;
	if (!GetGitHubConfig(Token, Repo))
	{
		OnComplete.ExecuteIfBound(false, TArray<FDevOpsGitHubIssue>());
		return;
	}

	FString URL = FString::Printf(TEXT("%s?state=open&per_page=%d"), *BuildAPIURL(Repo, TEXT("issues")), FMath::Clamp(MaxResults, 1, 100));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Accept"), TEXT("application/vnd.github+json"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Token));

	Request->OnProcessRequestComplete().BindLambda(
		[OnComplete](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
		{
			TArray<FDevOpsGitHubIssue> Issues;
			if (bSuccess && Resp.IsValid() && EHttpResponseCodes::IsOk(Resp->GetResponseCode()))
			{
				TArray<TSharedPtr<FJsonValue>> JsonArray;
				TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
				if (FJsonSerializer::Deserialize(Reader, JsonArray))
				{
					for (const auto& Val : JsonArray)
					{
						TSharedPtr<FJsonObject> Obj = Val->AsObject();
						if (Obj.IsValid())
						{
							FDevOpsGitHubIssue Issue;
							Issue.Number = Obj->GetIntegerField(TEXT("number"));
							Issue.Title = Obj->GetStringField(TEXT("title"));
							Issue.State = Obj->GetStringField(TEXT("state"));
							Issue.HTMLURL = Obj->GetStringField(TEXT("html_url"));
							Issues.Add(Issue);
						}
					}
				}
				OnComplete.ExecuteIfBound(true, Issues);
			}
			else
			{
				OnComplete.ExecuteIfBound(false, Issues);
			}
		});

	Request->ProcessRequest();
}

void UUEDevOpsGitHubService::ListReleases(int32 MaxResults, const FOnGitHubReleasesListed& OnComplete)
{
	FString Token, Repo;
	if (!GetGitHubConfig(Token, Repo))
	{
		OnComplete.ExecuteIfBound(false, TArray<FDevOpsGitHubRelease>());
		return;
	}

	FString URL = FString::Printf(TEXT("%s?per_page=%d"), *BuildAPIURL(Repo, TEXT("releases")), FMath::Clamp(MaxResults, 1, 100));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Accept"), TEXT("application/vnd.github+json"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Token));

	Request->OnProcessRequestComplete().BindLambda(
		[OnComplete](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
		{
			TArray<FDevOpsGitHubRelease> Releases;
			if (bSuccess && Resp.IsValid() && EHttpResponseCodes::IsOk(Resp->GetResponseCode()))
			{
				TArray<TSharedPtr<FJsonValue>> JsonArray;
				TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
				if (FJsonSerializer::Deserialize(Reader, JsonArray))
				{
					for (const auto& Val : JsonArray)
					{
						TSharedPtr<FJsonObject> Obj = Val->AsObject();
						if (Obj.IsValid())
						{
							FDevOpsGitHubRelease Release;
							Release.TagName = Obj->GetStringField(TEXT("tag_name"));
							Release.Name = Obj->GetStringField(TEXT("name"));
							Release.bPrerelease = Obj->GetBoolField(TEXT("prerelease"));
							Release.PublishedAt = Obj->GetStringField(TEXT("published_at"));
							Release.HTMLURL = Obj->GetStringField(TEXT("html_url"));
							Releases.Add(Release);
						}
					}
				}
				OnComplete.ExecuteIfBound(true, Releases);
			}
			else
			{
				OnComplete.ExecuteIfBound(false, Releases);
			}
		});

	Request->ProcessRequest();
}

void UUEDevOpsGitHubService::OpenCreateIssueDialog()
{
	TSharedRef<SWindow> Window = SNew(SWindow)
		.Title(FText::FromString(TEXT("Create GitHub Issue")))
		.ClientSize(FVector2D(500, 400))
		.SupportsMinimize(false)
		.SupportsMaximize(false);

	TSharedPtr<SEditableTextBox> TitleBox;
	TSharedPtr<SMultiLineEditableTextBox> BodyBox;

	Window->SetContent(
		SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(8)
		[
			SNew(STextBlock).Text(FText::FromString(TEXT("Title")))
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(8, 0, 8, 8)
		[
			SAssignNew(TitleBox, SEditableTextBox)
			.HintText(FText::FromString(TEXT("Issue title...")))
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(8)
		[
			SNew(STextBlock).Text(FText::FromString(TEXT("Description")))
		]
		+ SVerticalBox::Slot()
		.FillHeight(1.0f)
		.Padding(8, 0, 8, 8)
		[
			SAssignNew(BodyBox, SMultiLineEditableTextBox)
			.HintText(FText::FromString(TEXT("Describe the issue...")))
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.HAlign(HAlign_Right)
		.Padding(8)
		[
			SNew(SButton)
			.Text(FText::FromString(TEXT("Create Issue")))
			.OnClicked_Lambda([TitleBox, BodyBox, Window]() -> FReply
			{
				FString Title = TitleBox->GetText().ToString();
				FString Body = BodyBox->GetText().ToString();

				if (!Title.IsEmpty())
				{
					CreateIssue(Title, Body, TArray<FString>(), FOnGitHubIssueCreated());
				}

				Window->RequestDestroyWindow();
				return FReply::Handled();
			})
		]
	);

	FSlateApplication::Get().AddWindow(Window);
}
