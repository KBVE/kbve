// stores/heroDiceStore.ts
import { atom } from 'nanostores';

// --- Types ---
type HeroDiceState = {
  values: number[];
  rolling: boolean;
};

// --- Store ---
export const $heroDiceState = atom<HeroDiceState>({
  values: [1, 1, 1, 1],
  rolling: false,
});

// --- Actions ---
export function initHeroDice(count = 4) {
  $heroDiceState.set({
    values: Array(count).fill(1),
    rolling: false,
  });
}

export function setHeroDiceRolling(isRolling: boolean) {
  $heroDiceState.set({
    ...$heroDiceState.get(),
    rolling: isRolling,
  });
}

export function setHeroDiceValues(values: number[]) {
  $heroDiceState.set({
    values,
    rolling: false,
  });
}
