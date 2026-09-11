#include "CoreMinimal.h"

#include "Containers/Ticker.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEWorldBench, Display, All);

/**
 * Putting the viewer somewhere, without a person holding the controls.
 *
 * A reading of what the world costs is only worth having if the next reading is
 * taken from the same place, and a person asked to stand still for a minute is
 * the least reliable part of that: a nudged stick between two conditions moves
 * the camera, and the difference between them then measures the move.
 *
 * So the camera is told where to be. What this is for is measurement, not for
 * playing, and it makes no attempt to be a nice way to travel -- it sets the
 * pawn down where it was told, at the rate it was told, and stops.
 */
namespace
{
	APawn* Viewer(UWorld* World)
	{
		if (!World)
		{
			return nullptr;
		}

		if (APlayerController* Controller = UGameplayStatics::GetPlayerController(World, 0))
		{
			return Controller->GetPawn();
		}

		return nullptr;
	}

	void Face(UWorld* World, const FRotator& Where)
	{
		if (APlayerController* Controller = UGameplayStatics::GetPlayerController(World, 0))
		{
			Controller->SetControlRotation(Where);
		}
	}

	/** The traverse in flight, if there is one. Only ever one at a time. */
	FTSTicker::FDelegateHandle GWalk;

	void StopWalk()
	{
		if (GWalk.IsValid())
		{
			FTSTicker::GetCoreTicker().RemoveTicker(GWalk);
			GWalk.Reset();
		}
	}

	bool Number(const TArray<FString>& Args, int32 At, float& Out)
	{
		if (!Args.IsValidIndex(At))
		{
			return false;
		}
		Out = FCString::Atof(*Args[At]);
		return true;
	}

	FAutoConsoleCommandWithWorldArgsAndOutputDevice GKBVEWorldBenchAt(
		TEXT("kbve.Bench.At"),
		TEXT("Put the viewer at X Y Z, optionally facing Yaw. Reports where it is with no arguments."),
		FConsoleCommandWithWorldArgsAndOutputDeviceDelegate::CreateLambda(
			[](const TArray<FString>& Args, UWorld* World, FOutputDevice& Ar)
	{
		APawn* Pawn = Viewer(World);
		if (!Pawn)
		{
			Ar.Logf(TEXT("no viewer"));
			return;
		}

		// No arguments is a question rather than a command, and the answer is in
		// the form the command takes: somewhere worth measuring is found by
		// walking there once and asking where that was.
		float X, Y, Z;
		if (!Number(Args, 0, X) || !Number(Args, 1, Y) || !Number(Args, 2, Z))
		{
			// Answered to the caller rather than to the log, because what asks is
			// usually not a person at the console: a command over the readout's
			// own endpoint is answered with what the console said, and a position
			// written to a log file is a position nobody asking can read.
			const FVector Where = Pawn->GetActorLocation();
			const FRotator Facing = Pawn->GetControlRotation();
			Ar.Logf(TEXT("%.0f %.0f %.0f %.0f"), Where.X, Where.Y, Where.Z, Facing.Yaw);
			return;
		}

		StopWalk();
		Pawn->TeleportTo(FVector(X, Y, Z), Pawn->GetActorRotation(), false, true);

		float Yaw;
		if (Number(Args, 3, Yaw))
		{
			Face(World, FRotator(0.0f, Yaw, 0.0f));
		}

		Ar.Logf(TEXT("at %.0f %.0f %.0f"), X, Y, Z);
	}));

	FAutoConsoleCommandWithWorldAndArgs GKBVEWorldBenchWalk(
		TEXT("kbve.Bench.Walk"),
		TEXT("Carry the viewer Yaw-wards at Speed for Seconds. No arguments stops it."),
		FConsoleCommandWithWorldAndArgsDelegate::CreateLambda(
			[](const TArray<FString>& Args, UWorld* World)
	{
		StopWalk();

		float Yaw, Speed, Seconds;
		if (!Number(Args, 0, Yaw) || !Number(Args, 1, Speed) || !Number(Args, 2, Seconds))
		{
			UE_LOG(LogKBVEWorldBench, Display, TEXT("kbve.Bench.Walk: stopped"));
			return;
		}

		if (!Viewer(World))
		{
			UE_LOG(LogKBVEWorldBench, Warning, TEXT("kbve.Bench.Walk: no viewer"));
			return;
		}

		Face(World, FRotator(0.0f, Yaw, 0.0f));

		// Moved by the clock rather than by the frame, so a slow stretch covers
		// the same ground as a fast one: what is being measured is a route, and
		// a route walked further because the frames were quicker is a different
		// route.
		TWeakObjectPtr<UWorld> Held(World);
		const FVector Step = FRotator(0.0f, Yaw, 0.0f).Vector() * Speed;
		double Left = Seconds;

		GWalk = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
			[Held, Step, Left](float Delta) mutable
		{
			APawn* Pawn = Viewer(Held.Get());
			if (!Pawn)
			{
				GWalk.Reset();
				return false;
			}

			Pawn->TeleportTo(Pawn->GetActorLocation() + Step * Delta, Pawn->GetActorRotation(),
				false, true);

			Left -= Delta;
			if (Left <= 0.0)
			{
				UE_LOG(LogKBVEWorldBench, Display, TEXT("kbve.Bench.Walk: arrived"));
				GWalk.Reset();
				return false;
			}
			return true;
		}), 0.0f);

		UE_LOG(LogKBVEWorldBench, Display, TEXT("kbve.Bench.Walk: %.0f deg at %.0f for %.0fs"),
			Yaw, Speed, Seconds);
	}));
}
