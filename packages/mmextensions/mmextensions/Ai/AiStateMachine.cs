using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;


namespace KBVE.MMExtensions.Ai
    {
    public static class AiStateMachine
    {
        [Flags]
        public enum AiStateType
        {
            None = 0,
            Idle = 1 << 0,
            Attack = 1 << 1,
            ChaseEnemy = 1 << 2,    
            Follow = 1 << 3,
            Defend = 1 << 4,
            Flee = 1 << 5,
            Heal = 1 << 6,
            Death = 1 << 7,
            Dead = 1 << 8
        }

        private static readonly Queue<AiStateType> _stateHistory = new();
        private const int MaxHistorySize = 10;
        private static AiStateType _currentState = AiStateType.Idle; 
        private static readonly Dictionary<AiStateType, Dictionary<AiStateType, int>> StateTransitionMemory = new();
        private static readonly object _memoryLock = new();


        public static string ToStateName(this AiStateType stateType)
        {
            try
            {
                return stateType switch
                {
                    AiStateType.Idle => "Idle",
                    AiStateType.Attack => "Attack",
                    AiStateType.ChaseEnemy => "ChaseEnemy",
                    AiStateType.Follow => "Follow",
                    AiStateType.Defend => "Defend",
                    AiStateType.Flee => "Flee",
                    AiStateType.Heal => "Heal",
                    AiStateType.Death => "Death",
                    AiStateType.Dead => "Dead",
                    _ => throw new ArgumentOutOfRangeException(nameof(stateType), $"No string representation for state {stateType}")
                };
            }
            catch (ArgumentOutOfRangeException e)
            {
                Debug.LogError($"Error in ToStateName: {e.Message}");
                throw;
            }
        }

        public static AiStateType FromStateName(string stateName)
        {
            try
            {
                return stateName switch
                {
                    "Idle" => AiStateType.Idle,
                    "Attack" => AiStateType.Attack,
                    "ChaseEnemy" => AiStateType.ChaseEnemy,
                    "Follow" => AiStateType.Follow,
                    "Defend" => AiStateType.Defend,
                    "Flee" => AiStateType.Flee,
                    "Heal" => AiStateType.Heal,
                    "Death" => AiStateType.Death,
                    "Dead" => AiStateType.Dead,
                    _ => throw new ArgumentException($"Invalid state name: {stateName}", nameof(stateName))
                };
            }
            catch (ArgumentException e)
            {
                Debug.LogError($"Error in FromStateName: {e.Message}");
                throw;
            }
        }

        public static AiStateType MoveBitShiftState(AiStateType currentState, int shiftAmount)
        {
            // Perform a bitwise left or right shift
            int currentStateValue = (int)currentState;
            int shiftedValue = shiftAmount > 0
                ? currentStateValue << shiftAmount // Left shift
                : currentStateValue >> -shiftAmount; // Right shift for negative values

            // Clamp the shifted value within the valid state range
            shiftedValue = Mathf.Clamp(shiftedValue, (int)AiStateType.None, (int)AiStateType.Dead);

            // Return the new state
            return (AiStateType)shiftedValue;
        }

        public static async UniTask TransitionToStateAsync(AiStateType newState)
        {
            if (_currentState == newState)
            {
                Debug.Log($"Already in state: {newState.ToStateName()}");
                return;
            }

            await AddStateToHistoryAsync(_currentState);

            Debug.Log($"Transitioning from {_currentState.ToStateName()} to {newState.ToStateName()}");
            _currentState = newState;
        }

        private static async UniTask AddStateToHistoryAsync(AiStateType state)
        {
            await UniTask.SwitchToMainThread();
            _stateHistory.Enqueue(state);
            if (_stateHistory.Count > MaxHistorySize)
            {
                _stateHistory.Dequeue();
            }
        }

        public static async UniTask<List<AiStateType>> GetStateHistoryAsync()
        {
            await UniTask.SwitchToMainThread(); 
            return new List<AiStateType>(_stateHistory);
        }

        public static async UniTask<AiStateType> StateOpsAsync(string fromStateName, string toStateName)
        {
            AiStateType fromState = FromStateName(fromStateName);
            AiStateType toState = FromStateName(toStateName);

            if (StateTransitionMemory.TryGetValue(fromState, out var transitions) &&
                transitions.TryGetValue(toState, out var cachedShift))
            {
                Debug.Log($"Using cached shift from {fromStateName} to {toStateName}: {cachedShift}");
                return MoveBitShiftState(fromState, cachedShift);
            }

            int fromValue = (int)fromState;
            int toValue = (int)toState;

            int shiftAmount = (int)Math.Log2(toValue) - (int)Math.Log2(fromValue);
            AiStateType result = MoveBitShiftState(fromState, shiftAmount);

            await CacheTransitionAsync(fromState, toState, shiftAmount);
            Debug.Log($"Shifted from {fromStateName} to {toStateName} with shift amount {shiftAmount}. Result: {result.ToStateName()}");

            return result;
        }

        private static async UniTask CacheTransitionAsync(AiStateType fromState, AiStateType toState, int shiftAmount)
        {
            await UniTask.SwitchToTaskPool();
            lock (_memoryLock)
            {
                if (!StateTransitionMemory.ContainsKey(fromState))
                {
                    StateTransitionMemory[fromState] = new Dictionary<AiStateType, int>();
                }
                StateTransitionMemory[fromState][toState] = shiftAmount;
            }
        }

    }
}