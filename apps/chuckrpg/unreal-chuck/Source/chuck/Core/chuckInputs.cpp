#include "chuckInputs.h"

#include "EnhancedActionKeyMapping.h"
#include "InputAction.h"
#include "InputCoreTypes.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"

UchuckInputs* UchuckInputs::Get()
{
	static TObjectPtr<UchuckInputs> Instance;
	if (!Instance)
	{
		Instance = NewObject<UchuckInputs>(GetTransientPackage(), TEXT("chuckInputs"));
		Instance->AddToRoot();
		Instance->Build();
	}
	return Instance;
}

void UchuckInputs::Build()
{
	Move             = NewObject<UInputAction>(this, TEXT("IA_Move"));
	Look             = NewObject<UInputAction>(this, TEXT("IA_Look"));
	Jump             = NewObject<UInputAction>(this, TEXT("IA_Jump"));
	Sprint           = NewObject<UInputAction>(this, TEXT("IA_Sprint"));
	Crouch           = NewObject<UInputAction>(this, TEXT("IA_Crouch"));
	ToggleCamera     = NewObject<UInputAction>(this, TEXT("IA_ToggleCamera"));
	Pause            = NewObject<UInputAction>(this, TEXT("IA_Pause"));
	ToggleSettings   = NewObject<UInputAction>(this, TEXT("IA_ToggleSettings"));
	ToggleDevOverlay = NewObject<UInputAction>(this, TEXT("IA_ToggleDevOverlay"));
	Inventory        = NewObject<UInputAction>(this, TEXT("IA_Inventory"));
	ToggleChat       = NewObject<UInputAction>(this, TEXT("IA_ToggleChat"));
	FocusChat        = NewObject<UInputAction>(this, TEXT("IA_FocusChat"));
	Interact         = NewObject<UInputAction>(this, TEXT("IA_Interact"));
	Attack           = NewObject<UInputAction>(this, TEXT("IA_Attack"));

	Move->ValueType             = EInputActionValueType::Axis2D;
	Look->ValueType             = EInputActionValueType::Axis2D;
	Jump->ValueType             = EInputActionValueType::Boolean;
	Sprint->ValueType           = EInputActionValueType::Boolean;
	Crouch->ValueType           = EInputActionValueType::Boolean;
	ToggleCamera->ValueType     = EInputActionValueType::Boolean;
	Pause->ValueType            = EInputActionValueType::Boolean;
	ToggleSettings->ValueType   = EInputActionValueType::Boolean;
	ToggleDevOverlay->ValueType = EInputActionValueType::Boolean;
	ToggleChat->ValueType       = EInputActionValueType::Boolean;
	FocusChat->ValueType        = EInputActionValueType::Boolean;
	Interact->ValueType         = EInputActionValueType::Boolean;
	Attack->ValueType           = EInputActionValueType::Boolean;

	DefaultIMC = NewObject<UInputMappingContext>(this, TEXT("IMC_Default"));

	DefaultIMC->MapKey(Jump,             EKeys::SpaceBar);
	DefaultIMC->MapKey(Sprint,           EKeys::LeftShift);
	DefaultIMC->MapKey(Crouch,           EKeys::LeftControl);
	DefaultIMC->MapKey(ToggleCamera,     EKeys::V);
	DefaultIMC->MapKey(Pause,            EKeys::Escape);
	DefaultIMC->MapKey(ToggleSettings,   EKeys::Semicolon);
	DefaultIMC->MapKey(ToggleDevOverlay, EKeys::Tilde);
	DefaultIMC->MapKey(Inventory,        EKeys::I);
	DefaultIMC->MapKey(ToggleChat,       EKeys::Slash);
	DefaultIMC->MapKey(Interact,         EKeys::F);
	DefaultIMC->MapKey(Attack,           EKeys::LeftMouseButton);

	{
		FEnhancedActionKeyMapping& LookMap = DefaultIMC->MapKey(Look, EKeys::Mouse2D);
		UInputModifierNegate* NegY = NewObject<UInputModifierNegate>(this);
		NegY->bX = false;
		NegY->bY = true;
		NegY->bZ = false;
		LookMap.Modifiers.Add(NegY);
	}

	auto AddMoveBinding = [this](FKey Key, bool bSwizzleXY, bool bNegateX, bool bNegateY)
	{
		FEnhancedActionKeyMapping& M = DefaultIMC->MapKey(Move, Key);
		if (bSwizzleXY)
		{
			UInputModifierSwizzleAxis* Sw = NewObject<UInputModifierSwizzleAxis>(this);
			Sw->Order = EInputAxisSwizzle::YXZ;
			M.Modifiers.Add(Sw);
		}
		if (bNegateX || bNegateY)
		{
			UInputModifierNegate* Neg = NewObject<UInputModifierNegate>(this);
			Neg->bX = bNegateX;
			Neg->bY = bNegateY;
			Neg->bZ = false;
			M.Modifiers.Add(Neg);
		}
	};

	AddMoveBinding(EKeys::W, /*swizzle*/ true,  /*negX*/ false, /*negY*/ false);
	AddMoveBinding(EKeys::S, /*swizzle*/ true,  /*negX*/ false, /*negY*/ true);
	AddMoveBinding(EKeys::A, /*swizzle*/ false, /*negX*/ true,  /*negY*/ false);
	AddMoveBinding(EKeys::D, /*swizzle*/ false, /*negX*/ false, /*negY*/ false);
}
