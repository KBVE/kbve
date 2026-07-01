#include "SimgridDamageText.h"
#include "Components/TextRenderComponent.h"

ASimgridDamageText::ASimgridDamageText()
{
	PrimaryActorTick.bCanEverTick = true;

	Text = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Text"));
	SetRootComponent(Text);
	Text->SetHorizontalAlignment(EHTA_Center);
	Text->SetWorldSize(64.0f);
}

void ASimgridDamageText::Init(int32 Amount, bool bCrit)
{
	if (Text)
	{
		Text->SetText(FText::AsNumber(Amount));
		Text->SetTextRenderColor(bCrit ? FColor(255, 200, 0) : FColor::White);
		Text->SetWorldSize(bCrit ? 96.0f : 64.0f);
	}
}

void ASimgridDamageText::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Age += DeltaSeconds;
	AddActorWorldOffset(FVector(0.0f, 0.0f, RISE_SPEED * DeltaSeconds));

	if (Text)
	{
		const float Alpha = FMath::Clamp(1.0f - (Age / LIFETIME), 0.0f, 1.0f);
		FColor C = Text->TextRenderColor;
		C.A = (uint8)(Alpha * 255.0f);
		Text->SetTextRenderColor(C);
	}

	if (Age >= LIFETIME)
	{
		Destroy();
	}
}
