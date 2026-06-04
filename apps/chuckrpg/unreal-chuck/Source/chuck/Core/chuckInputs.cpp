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
	Move         = NewObject<UInputAction>(this, TEXT("IA_Move"));
	Look         = NewObject<UInputAction>(this, TEXT("IA_Look"));
	Jump         = NewObject<UInputAction>(this, TEXT("IA_Jump"));
	Sprint       = NewObject<UInputAction>(this, TEXT("IA_Sprint"));
	Crouch       = NewObject<UInputAction>(this, TEXT("IA_Crouch"));
	ToggleCamera = NewObject<UInputAction>(this, TEXT("IA_ToggleCamera"));

	Move->ValueType         = EInputActionValueType::Axis2D;
	Look->ValueType         = EInputActionValueType::Axis2D;
	Jump->ValueType         = EInputActionValueType::Boolean;
	Sprint->ValueType       = EInputActionValueType::Boolean;
	Crouch->ValueType       = EInputActionValueType::Boolean;
	ToggleCamera->ValueType = EInputActionValueType::Boolean;

	DefaultIMC = NewObject<UInputMappingContext>(this, TEXT("IMC_Default"));

	DefaultIMC->MapKey(Jump,         EKeys::SpaceBar);
	DefaultIMC->MapKey(Sprint,       EKeys::LeftShift);
	DefaultIMC->MapKey(Crouch,       EKeys::LeftControl);
	DefaultIMC->MapKey(ToggleCamera, EKeys::V);

	DefaultIMC->MapKey(Look, EKeys::Mouse2D);

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
