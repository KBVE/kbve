import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import { eventEngine, userClientService } from '@kbve/astropad';

// Types and interfaces
export interface ConchShellState {
  question: string;
  answer: 'yes' | 'no' | null;
  isFlipping: boolean;
  hasFlipped: boolean;
  flipCount: number;
  lastFlipTime: number | null;
  animationPhase: 'idle' | 'flipping' | 'revealing' | 'complete';
  // Persistent history data
  totalConsultations: number;
  sessionConsultations: number;
  // User state
  username: string | null;
  displayName: string | null;
  isUserLoading: boolean;
}

export interface ConchShellConfig {
  id?: string;
  initialQuestion?: string;
  flipDuration?: number;
  revealDelay?: number;
}

export interface ConchShellActions {
  setQuestion: (question: string) => void;
  flipCoin: () => Promise<void>;
  reset: () => void;
  destroy: () => void;
}

// Interface for consultation history
export interface ConsultationHistory {
  totalConsultations: number;
  lastConsultationTime: number | null;
  sessionConsultations: number; // Current session count
}

// Persistent atom to store consultation history across sessions
export const consultationHistoryAtom = persistentAtom<ConsultationHistory>(
  'conch-shell-history',
  {
    totalConsultations: 0,
    lastConsultationTime: null,
    sessionConsultations: 0,
  },
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  }
);

// Helper functions for managing consultation history
export const consultationHistoryActions = {
  // Record a new consultation
  recordConsultation: () => {
    const current = consultationHistoryAtom.get();
    consultationHistoryAtom.set({
      totalConsultations: current.totalConsultations + 1,
      lastConsultationTime: Date.now(),
      sessionConsultations: current.sessionConsultations + 1,
    });
  },

  // Reset session count (called on page load/refresh)
  resetSessionCount: () => {
    const current = consultationHistoryAtom.get();
    consultationHistoryAtom.set({
      ...current,
      sessionConsultations: 0,
    });
  },

  // Get formatted consultation stats
  getStats: () => {
    const history = consultationHistoryAtom.get();
    return {
      total: history.totalConsultations,
      session: history.sessionConsultations,
      lastTime: history.lastConsultationTime,
      hasHistory: history.totalConsultations > 0,
    };
  },

  // Clear all history (for reset functionality)
  clearHistory: () => {
    consultationHistoryAtom.set({
      totalConsultations: 0,
      lastConsultationTime: null,
      sessionConsultations: 0,
    });
  },
};

// Default state
const createInitialState = (config: ConchShellConfig = {}): ConchShellState => {
  const history = consultationHistoryActions.getStats();

  // Get current user state from userClientService
  const username = userClientService.usernameAtom.get();
  const user = userClientService.userAtom.get();
  const isUserLoading = userClientService.userLoadingAtom.get();

  // Extract display name from user metadata or use username
  let displayName: string | null = null;
  if (user?.user_metadata?.full_name) {
    displayName = user.user_metadata.full_name;
  } else if (user?.user_metadata?.name) {
    displayName = user.user_metadata.name;
  } else if (username) {
    displayName = username;
  }

  return {
    question: config.initialQuestion || '',
    answer: null,
    isFlipping: false,
    hasFlipped: false,
    flipCount: 0,
    lastFlipTime: null,
    animationPhase: 'idle',
    totalConsultations: history.total,
    sessionConsultations: history.session,
    username,
    displayName,
    isUserLoading,
  };
};

// Service class
export class ConchShellService implements ConchShellActions {
  private stateAtom = atom<ConchShellState>(createInitialState());
  private config: Required<ConchShellConfig>;
  private flipTimeout: number | null = null;
  private userUnsubscribe: (() => void) | null = null;
  private usernameUnsubscribe: (() => void) | null = null;
  private userLoadingUnsubscribe: (() => void) | null = null;

  constructor(config: ConchShellConfig = {}) {
    this.config = {
      id: config.id || `conchshell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      initialQuestion: config.initialQuestion || '',
      flipDuration: config.flipDuration || 2000, // 2 seconds for flip animation
      revealDelay: config.revealDelay || 500, // 0.5 seconds before revealing result
      ...config,
    };

    // Reset session count on initialization
    consultationHistoryActions.resetSessionCount();

    // Initialize state with config and current history
    this.stateAtom.set(createInitialState(this.config));

    // Subscribe to user state changes
    this.subscribeToUserState();
  }

  // Get reactive state atom
  getStateAtom() {
    return this.stateAtom;
  }

  // Get current state (non-reactive)
  getState(): ConchShellState {
    return this.stateAtom.get();
  }

  // Subscribe to user state changes from userClientService
  private subscribeToUserState(): void {
    // Subscribe to username changes
    this.usernameUnsubscribe = userClientService.usernameAtom.subscribe((username) => {
      this.updateUserState();
    });

    // Subscribe to user object changes (for display name)
    this.userUnsubscribe = userClientService.userAtom.subscribe((user) => {
      this.updateUserState();
    });

    // Subscribe to loading state changes
    this.userLoadingUnsubscribe = userClientService.userLoadingAtom.subscribe((isLoading) => {
      this.updateUserState();
    });
  }

  // Update user state in our atom when userClientService state changes
  private updateUserState(): void {
    const currentState = this.getState();
    const username = userClientService.usernameAtom.get();
    const user = userClientService.userAtom.get();
    const isUserLoading = userClientService.userLoadingAtom.get();

    // Extract display name from user metadata or use username
    let displayName: string | null = null;
    if (user?.user_metadata?.full_name) {
      displayName = user.user_metadata.full_name;
    } else if (user?.user_metadata?.name) {
      displayName = user.user_metadata.name;
    } else if (username) {
      displayName = username;
    }

    this.stateAtom.set({
      ...currentState,
      username,
      displayName,
      isUserLoading,
    });
  }

  // Actions
  setQuestion = (question: string): void => {
    const currentState = this.getState();
    this.stateAtom.set({
      ...currentState,
      question: question.trim(),
    });

    // Emit event
    eventEngine.emit('conchshell:question:set', 'ConchShellService', {
      shellId: this.config.id,
      question: question.trim(),
    });
  };

  flipCoin = async (): Promise<void> => {
    const currentState = this.getState();

    // Don't flip if already flipping or no question
    if (currentState.isFlipping || !currentState.question.trim()) {
      return;
    }

    // Clear any existing timeout
    if (this.flipTimeout) {
      clearTimeout(this.flipTimeout);
    }

    const startTime = Date.now();

    // Start flipping animation
    this.stateAtom.set({
      ...currentState,
      isFlipping: true,
      animationPhase: 'flipping',
      answer: null,
    });

    // Emit flip start event
    eventEngine.emit('conchshell:flip:start', 'ConchShellService', {
      shellId: this.config.id,
      question: currentState.question,
      flipCount: currentState.flipCount + 1,
    });

    // Generate random result
    const result: 'yes' | 'no' = Math.random() < 0.5 ? 'yes' : 'no';

    // Wait for flip duration
    await new Promise(resolve => {
      this.flipTimeout = window.setTimeout(resolve, this.config.flipDuration);
    });

    // Transition to revealing phase
    const revealState = this.getState();
    this.stateAtom.set({
      ...revealState,
      animationPhase: 'revealing',
    });

    // Wait for reveal delay
    await new Promise(resolve => {
      this.flipTimeout = window.setTimeout(resolve, this.config.revealDelay);
    });

    // Record consultation in persistent storage
    consultationHistoryActions.recordConsultation();
    const updatedHistory = consultationHistoryActions.getStats();

    // Show final result
    const finalState = this.getState();
    this.stateAtom.set({
      ...finalState,
      answer: result,
      isFlipping: false,
      hasFlipped: true,
      flipCount: finalState.flipCount + 1,
      lastFlipTime: startTime,
      animationPhase: 'complete',
      totalConsultations: updatedHistory.total,
      sessionConsultations: updatedHistory.session,
    });

    // Emit flip complete event
    eventEngine.emit('conchshell:flip:complete', 'ConchShellService', {
      shellId: this.config.id,
      question: finalState.question,
      answer: result,
      flipCount: finalState.flipCount + 1,
      duration: Date.now() - startTime,
      totalConsultations: updatedHistory.total,
      sessionConsultations: updatedHistory.session,
    });
  };

  reset = (): void => {
    // Clear any pending timeout
    if (this.flipTimeout) {
      clearTimeout(this.flipTimeout);
      this.flipTimeout = null;
    }

    const resetState = createInitialState(this.config);
    this.stateAtom.set(resetState);

    // Emit reset event
    eventEngine.emit('conchshell:reset', 'ConchShellService', {
      shellId: this.config.id,
    });
  };

  destroy = (): void => {
    // Clear any pending timeout
    if (this.flipTimeout) {
      clearTimeout(this.flipTimeout);
      this.flipTimeout = null;
    }

    // Clean up user state subscriptions
    if (this.userUnsubscribe) {
      this.userUnsubscribe();
      this.userUnsubscribe = null;
    }
    if (this.usernameUnsubscribe) {
      this.usernameUnsubscribe();
      this.usernameUnsubscribe = null;
    }
    if (this.userLoadingUnsubscribe) {
      this.userLoadingUnsubscribe();
      this.userLoadingUnsubscribe = null;
    }

    // Emit destroy event
    eventEngine.emit('conchshell:destroy', 'ConchShellService', {
      shellId: this.config.id,
    });
  };

  // Utility methods
  canFlip(): boolean {
    const state = this.getState();
    return !state.isFlipping && state.question.trim().length > 0;
  }

  getConfig(): Required<ConchShellConfig> {
    return { ...this.config };
  }
}

// Factory function for creating service instances
export const createConchShellService = (config?: ConchShellConfig): ConchShellService => {
  return new ConchShellService(config);
};

// Event types for the event engine
export const ConchShellEventTypes = {
  QUESTION_SET: 'conchshell:question:set',
  FLIP_START: 'conchshell:flip:start',
  FLIP_COMPLETE: 'conchshell:flip:complete',
  RESET: 'conchshell:reset',
  DESTROY: 'conchshell:destroy',
} as const;