#pragma once

#include "CoreMinimal.h"
#include "Containers/Queue.h"
#include "Modules/ModuleManager.h"
#include "UObject/WeakObjectPtr.h"

class FKBVEEventsModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};

// Subscription handle. Cancel via Unsubscribe() or by letting the owning
// UObject GC -- channels prune stale weak refs before each dispatch.
struct FKBVEEventHandle
{
	uint64 Id = 0;

	bool IsValid() const { return Id != 0; }
	void Reset()         { Id = 0; }
};

// Game-thread typed channel.
//
// CONTRACT:
//   Publish() invokes callbacks SYNCHRONOUSLY on the calling thread. Callbacks
//   typically touch UObjects, Slate, Actors, World state -- assume game thread.
//   Do NOT call Publish() from a worker thread unless every single subscriber
//   is provably thread-safe. The safe cross-thread path is TKBVEMpscQueue
//   below: worker enqueues a POD payload, game-thread bridge drains and then
//   Publishes synchronously on the channel.
//
// Subscribe/Unsubscribe/Publish are FCriticalSection-guarded so the channel
// itself doesn't tear, but that does not make subscriber callbacks thread-safe.
template<typename TPayload>
class TKBVEChannel
{
public:
	using FCallback = TFunction<void(const TPayload&)>;

	FKBVEEventHandle Subscribe(FCallback&& Callback)
	{
		FScopeLock Lock(&CritSec);
		FKBVEEventHandle Handle;
		Handle.Id = ++NextId;
		Subscribers.Add(FEntry{ Handle.Id, nullptr, MoveTemp(Callback) });
		return Handle;
	}

	FKBVEEventHandle Subscribe(UObject* Owner, FCallback&& Callback)
	{
		FScopeLock Lock(&CritSec);
		FKBVEEventHandle Handle;
		Handle.Id = ++NextId;
		Subscribers.Add(FEntry{ Handle.Id, Owner, MoveTemp(Callback) });
		return Handle;
	}

	void Unsubscribe(FKBVEEventHandle Handle)
	{
		if (!Handle.IsValid())
		{
			return;
		}
		FScopeLock Lock(&CritSec);
		Subscribers.RemoveAll([Handle](const FEntry& E) { return E.Id == Handle.Id; });
	}

	void Publish(const TPayload& Payload)
	{
		TArray<FEntry> Snapshot;
		{
			FScopeLock Lock(&CritSec);
			Subscribers.RemoveAll([](const FEntry& E) { return E.Owner.IsStale(); });
			Snapshot = Subscribers;
		}
		for (const FEntry& E : Snapshot)
		{
			if (!E.Owner.IsExplicitlyNull() && !E.Owner.IsValid())
			{
				continue;
			}
			E.Callback(Payload);
		}
	}

	int32 NumSubscribers()
	{
		FScopeLock Lock(&CritSec);
		return Subscribers.Num();
	}

private:
	struct FEntry
	{
		uint64                  Id;
		TWeakObjectPtr<UObject> Owner;
		FCallback               Callback;
	};

	FCriticalSection      CritSec;
	TArray<FEntry>        Subscribers;
	uint64                NextId = 0;
};

// Multi-producer single-consumer queue for cross-thread event handoff.
//
// CONTRACT:
//   Enqueue() is safe from ANY thread (workers, Mass processors, async tasks).
//   Dequeue() is the SINGLE-CONSUMER path: must always run on the same
//   thread (typically game thread via a UTickableWorldSubsystem::Tick drain).
//
// Payload is POD. Don't put TObjectPtr or anything with heap-managed lifetime
// inside -- by the time the consumer drains, the world may have GC'd. Use
// FMassEntityHandle, primitives, FVector, FName instead.
template<typename TPayload>
class TKBVEMpscQueue
{
public:
	void Enqueue(const TPayload& Payload)
	{
		Queue.Enqueue(Payload);
	}

	void Enqueue(TPayload&& Payload)
	{
		Queue.Enqueue(MoveTemp(Payload));
	}

	bool Dequeue(TPayload& Out)
	{
		return Queue.Dequeue(Out);
	}

	bool IsEmpty() const
	{
		return Queue.IsEmpty();
	}

	// Drain all pending into Visitor; Visitor is invoked synchronously on
	// the dequeuing thread, once per event. Used by the game-thread bridge.
	template<typename TVisitor>
	int32 Drain(TVisitor&& Visitor)
	{
		int32 Count = 0;
		TPayload Item;
		while (Queue.Dequeue(Item))
		{
			Visitor(Item);
			++Count;
		}
		return Count;
	}

private:
	TQueue<TPayload, EQueueMode::Mpsc> Queue;
};
