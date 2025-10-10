/** @jsxImportSource react */
import { useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { createConchShellService, type ConchShellConfig } from './ServiceConchShell';

// Form data type
interface ConchForm {
  question: string;
}

// Component props (optimized for DOM manipulation)
export interface ReactConchShellProps extends ConchShellConfig {
  questionPlaceholder?: string;
  submitText?: string;
  resetText?: string;
  showHistory?: boolean;
}

export const ReactConchShell = memo(({
  questionPlaceholder = "Ask the conch shell a yes/no question...",
  submitText = "Flip the Coin",
  resetText = "Ask Again",
  showHistory = true,
  ...serviceConfig
}: ReactConchShellProps) => {
  const serviceRef = useRef(createConchShellService(serviceConfig));
  const service = serviceRef.current;
  const state = useStore(service.getStateAtom());

  // Audio refs for playing sounds
  const yesAudioRef = useRef<HTMLAudioElement | null>(null);
  const noAudioRef = useRef<HTMLAudioElement | null>(null);

  // DOM element refs
  const shellDisplayRef = useRef<HTMLDivElement | null>(null);
  const resultAreaRef = useRef<HTMLDivElement | null>(null);
  const historyStatsRef = useRef<HTMLDivElement | null>(null);

  // React Hook Form to adopt the existing static form
  const { register, handleSubmit, setValue, trigger, watch, formState: { errors, isValid } } = useForm<ConchForm>({
    defaultValues: {
      question: serviceConfig.initialQuestion || ''
    },
    mode: 'onChange'
  });

  // Initialize DOM refs and audio
  useEffect(() => {
    // Get DOM elements
    shellDisplayRef.current = document.getElementById('conch-shell-display') as HTMLDivElement;
    resultAreaRef.current = document.getElementById('result-area') as HTMLDivElement;
    historyStatsRef.current = document.getElementById('history-stats') as HTMLDivElement;

    // Initialize audio
    yesAudioRef.current = new Audio('https://6dla38eua1.ufs.sh/f/6AKUJSzq8EG0YjraBiR6hb1V5kCJgmYT4cBDri73oWew0Hvd');
    noAudioRef.current = new Audio('https://6dla38eua1.ufs.sh/f/6AKUJSzq8EG0TjPKPsFgdybK7lMmEnHj3P9LtcekrIu2BUVp');

    if (yesAudioRef.current) {
      yesAudioRef.current.preload = 'auto';
      yesAudioRef.current.volume = 0.7;
    }
    if (noAudioRef.current) {
      noAudioRef.current.preload = 'auto';
      noAudioRef.current.volume = 0.7;
    }

    // Set initial question if provided
    if (serviceConfig.initialQuestion) {
      setValue('question', serviceConfig.initialQuestion);
      service.setQuestion(serviceConfig.initialQuestion);
    }

    return () => {
      // Cleanup audio
      if (yesAudioRef.current) {
        yesAudioRef.current.pause();
        yesAudioRef.current = null;
      }
      if (noAudioRef.current) {
        noAudioRef.current.pause();
        noAudioRef.current = null;
      }

      service.destroy();
    };
  }, []);

  // Optimized form handlers with useCallback
  const onSubmit = useCallback(async (data: ConchForm) => {
    if (data.question.trim() && service.canFlip()) {
      await service.flipCoin();
    }
  }, [service]);

  const handleReset = useCallback(() => {
    service.reset();
    setValue('question', '');
  }, [service, setValue]);

  // Watch question changes
  const watchedQuestion = watch('question');

  // Update service when question changes
  useEffect(() => {
    service.setQuestion(watchedQuestion || '');
  }, [watchedQuestion, service]);

  // Update ARIA live regions for screen readers
  const updateAriaLiveRegions = () => {
    const shellStatus = document.getElementById('shell-status');

    if (shellStatus) {
      if (state.isFlipping) {
        shellStatus.textContent = 'Conch shell is consulting the mystical forces...';
      } else if (state.hasFlipped && state.answer) {
        shellStatus.textContent = `The oracle has spoken: ${state.answer}`;
      } else {
        shellStatus.textContent = 'Conch shell is ready for your question';
      }
    }
  };

  // Effect to update shell display only when animation state changes
  useEffect(() => {
    updateShellDisplay();
  }, [state.isFlipping, state.animationPhase, state.hasFlipped, state.answer]);

  // Effect to update result area only when answer changes
  useEffect(() => {
    updateResultArea();
  }, [state.hasFlipped, state.answer, state.question]);

  // Effect to update history stats only when consultation counts change
  useEffect(() => {
    updateHistoryStats();
  }, [state.sessionConsultations, state.totalConsultations, state.lastFlipTime]);

  // Effect to update ARIA regions only when meaningful state changes
  useEffect(() => {
    updateAriaLiveRegions();
  }, [state.isFlipping, state.hasFlipped, state.answer]);

  // Effect to play audio when answer is revealed
  useEffect(() => {
    if (state.hasFlipped && state.answer && state.animationPhase === 'complete') {
      const playAudio = async () => {
        try {
          if (state.answer === 'yes' && yesAudioRef.current) {
            await yesAudioRef.current.play();
          } else if (state.answer === 'no' && noAudioRef.current) {
            await noAudioRef.current.play();
          }
        } catch (error) {
          console.log('Audio play prevented:', error);
        }
      };
      playAudio();
    }
  }, [state.hasFlipped, state.answer, state.animationPhase]);

  const updateShellDisplay = () => {
    if (!shellDisplayRef.current) return;

    const { animationPhase, answer, isFlipping } = state;

    // Choose the appropriate conch shell image
    const conchShellImage = isFlipping || animationPhase === 'flipping'
      ? 'https://6dla38eua1.ufs.sh/f/6AKUJSzq8EG09lUEYLNDTAMoqHjYn4i5hvW2wpJU6yO0lft7' // Glow version
      : 'https://6dla38eua1.ufs.sh/f/6AKUJSzq8EG05DSvvyF5BKvHUktrMPng7u0GLNmCZ3DXalTs'; // Regular version

    let animationClasses = 'max-w-48 sm:max-w-56 h-auto transition-all duration-500 transform-gpu';

    if (animationPhase === 'flipping') animationClasses += ' animate-spin';
    if (animationPhase === 'revealing') animationClasses += ' animate-bounce';
    if (animationPhase === 'complete') animationClasses += ' scale-110';

    const filter = isFlipping
      ? 'drop-shadow(0 20px 25px rgba(0, 0, 0, 0.4))'
      : 'drop-shadow(0 10px 15px rgba(0, 0, 0, 0.3))';

    const altText = isFlipping
      ? 'Conch shell glowing and spinning, consulting the mystical forces'
      : state.hasFlipped && state.answer
      ? `Conch shell showing the answer: ${state.answer}`
      : 'Mystical conch shell ready for your question';

    shellDisplayRef.current.innerHTML = `
      <div class="relative flex justify-center">
        <img
          src="${conchShellImage}"
          alt="${altText}"
          class="${animationClasses}"
          style="filter: ${filter};"
          role="img"
        />
        ${state.hasFlipped && state.answer && animationPhase === 'complete' ? `
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="px-3 py-1 rounded-full text-sm font-bold text-white shadow-lg ${state.answer === 'yes' ? 'bg-green-500' : 'bg-red-500'}"
                 style="text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.5);"
                 role="status"
                 aria-label="Oracle answer: ${state.answer}">
              ${state.answer.toUpperCase()}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  const updateResultArea = () => {
    if (!resultAreaRef.current || !state.hasFlipped || !state.answer) {
      if (resultAreaRef.current) {
        resultAreaRef.current.innerHTML = '';
      }
      return;
    }

    const { answer } = state;
    // TypeScript now knows answer is not null due to the guard clause above
    const bgColor = answer === 'yes'
      ? 'var(--sl-color-green-low, #f0fdf4)'
      : 'var(--sl-color-red-low, #fef2f2)';
    const textColor = answer === 'yes'
      ? 'var(--sl-color-green-high, #166534)'
      : 'var(--sl-color-red-high, #991b1b)';
    const borderColor = answer === 'yes'
      ? 'var(--sl-color-green, #22c55e)'
      : 'var(--sl-color-red, #ef4444)';

    resultAreaRef.current.innerHTML = `
      <div class="text-center p-4 rounded-lg transition-all duration-300"
           style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor};"
           role="alert"
           aria-label="Oracle consultation result">
        <p class="font-semibold text-lg" style="text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);">
          The conch shell says: <span class="uppercase" role="status" aria-label="Answer is ${answer}">${answer}</span>
        </p>
        <p class="text-sm opacity-75 mt-1" style="text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);"
           aria-label="Your question was: ${state.question}">
          "${state.question}"
        </p>
      </div>
    `;
  };

  const updateHistoryStats = () => {
    if (!historyStatsRef.current || !showHistory) return;

    // Show stats if there are any consultations (session or total)
    if (state.sessionConsultations > 0 || state.totalConsultations > 0) {
      historyStatsRef.current.classList.remove('hidden');

      // Update session count
      const sessionCountElement = document.getElementById('session-count');
      if (sessionCountElement) {
        sessionCountElement.textContent = state.sessionConsultations.toString();
      }

      // Update total count
      const totalCountElement = document.getElementById('total-count');
      if (totalCountElement) {
        totalCountElement.textContent = state.totalConsultations.toString();
      }

      // Update last consultation time
      const lastFlipElement = document.getElementById('last-flip');
      const lastTimeElement = document.getElementById('last-time');

      if (state.lastFlipTime && lastFlipElement && lastTimeElement) {
        lastTimeElement.textContent = new Date(state.lastFlipTime).toLocaleTimeString();
        lastFlipElement.classList.remove('hidden');
      }
    } else {
      historyStatsRef.current.classList.add('hidden');
    }
  };

  // Memoized form component for optimal performance
  const FormComponent = useMemo(() => (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      role="form"
      aria-labelledby="oracle-title"
      aria-describedby="form-instructions"
    >
      <div className="relative">
        <label htmlFor="conch-question" className="sr-only">
          Ask the conch shell oracle a yes or no question
        </label>
        <textarea
          {...register('question', {
            required: 'Please enter a question',
            minLength: {
              value: 3,
              message: 'Question must be at least 3 characters'
            },
            maxLength: {
              value: 200,
              message: 'Question must be less than 200 characters'
            }
          })}
          id="conch-question"
          name="question"
          placeholder={questionPlaceholder}
          rows={3}
          disabled={state.isFlipping}
          className="w-full p-3 rounded-lg resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-200"
          style={{
            backgroundColor: 'var(--sl-color-bg)',
            border: `1px solid ${errors.question ? 'var(--sl-color-red, #ef4444)' : 'var(--sl-color-gray-5)'}`,
            color: 'var(--sl-color-text)',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.1)',
          }}
          aria-required="true"
          aria-describedby="form-instructions question-error"
          aria-invalid={errors.question ? 'true' : 'false'}
          maxLength={200}
          minLength={3}
        />
        <div id="form-instructions" className="sr-only">
          Enter a yes or no question between 3 and 200 characters. The oracle will provide guidance.
        </div>

        {/* Tooltip-style error message */}
        {errors.question && (
          <div
            id="question-error"
            className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full mb-2 px-3 py-2 text-sm rounded-lg shadow-lg pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              backgroundColor: 'var(--sl-color-red, #ef4444)',
              color: 'white',
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              maxWidth: '280px',
              textAlign: 'center',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
              // Tooltip arrow
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(50% + 8px) calc(100% - 8px), 50% 100%, calc(50% - 8px) calc(100% - 8px), 0 calc(100% - 8px))',
              paddingBottom: '12px', // Extra padding for the arrow
            }}
            role="alert"
            aria-live="polite"
          >
            {errors.question.message}
          </div>
        )}
      </div>

      {/* Action Buttons - Fixed layout to prevent shifts */}
      <div className="flex gap-3" role="group" aria-label="Oracle consultation actions">
        <button
          type="submit"
          disabled={!isValid || !watchedQuestion?.trim() || state.isFlipping}
          className="flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          style={{
            backgroundColor: (!isValid || !watchedQuestion?.trim() || state.isFlipping)
              ? 'var(--sl-color-gray-4)'
              : 'var(--sl-color-accent)',
            color: 'white',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)',
          }}
        >
          {state.isFlipping ? 'Consulting Oracle...' : submitText}
        </button>

        {/* Always render reset button space to prevent layout shift */}
        <button
          type="button"
          onClick={handleReset}
          disabled={state.isFlipping || !state.hasFlipped}
          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            !state.hasFlipped ? 'invisible' : 'visible'
          }`}
          style={{
            backgroundColor: 'var(--sl-color-gray-6)',
            color: 'var(--sl-color-text)',
            border: '1px solid var(--sl-color-gray-5)',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
          }}
          aria-label="Reset oracle and ask a new question"
        >
          {resetText}
        </button>
      </div>
    </form>
  ), [
    handleSubmit,
    onSubmit,
    register,
    questionPlaceholder,
    state.isFlipping,
    errors.question,
    isValid,
    watchedQuestion,
    submitText,
    handleReset,
    state.hasFlipped,
    resetText,
  ]);

  // Welcome message component
  const WelcomeMessage = useMemo(() => {
    if (state.isUserLoading) {
      return (
        <div
          className="mt-4 text-center text-sm"
          style={{
            color: 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <span
            className="animate-pulse font-medium"
            style={{
              textShadow: `
                0 0 8px rgba(138, 43, 226, 0.6),
                0 2px 4px rgba(0, 0, 0, 0.8),
                1px 1px 0 rgba(0, 0, 0, 0.9),
                -1px -1px 0 rgba(0, 0, 0, 0.9),
                1px -1px 0 rgba(0, 0, 0, 0.9),
                -1px 1px 0 rgba(0, 0, 0, 0.9)
              `,
            }}
          >
            Loading user...
          </span>
        </div>
      );
    }

    const welcomeText = state.displayName
      ? `Welcome back, ${state.displayName}!`
      : 'Welcome, guest!';

    return (
      <div
        className="mt-4 text-center text-sm"
        role="status"
        aria-label={`User status: ${welcomeText}`}
      >
        <span
          className="px-4 py-2 rounded-full backdrop-blur-sm font-semibold tracking-wide inline-block transition-all duration-300 hover:scale-105"
          style={{
            background: `
              linear-gradient(135deg,
                rgba(255, 255, 255, 0.12) 0%,
                rgba(255, 255, 255, 0.06) 50%,
                rgba(255, 255, 255, 0.03) 100%
              )
            `,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: `
              inset 1px 1px 2px rgba(255, 255, 255, 0.2),
              inset -1px -1px 2px rgba(0, 0, 0, 0.1),
              0 4px 12px rgba(0, 0, 0, 0.15)
            `,
            color: state.displayName
              ? 'rgba(255, 255, 255, 0.95)'
              : 'rgba(255, 255, 255, 0.8)',
            textShadow: state.displayName
              ? `
                  0 0 12px rgba(78, 205, 196, 0.8),
                  0 0 8px rgba(78, 205, 196, 0.6),
                  0 2px 4px rgba(0, 0, 0, 0.8),
                  1px 1px 0 rgba(0, 0, 0, 0.9),
                  -1px -1px 0 rgba(0, 0, 0, 0.9),
                  1px -1px 0 rgba(0, 0, 0, 0.9),
                  -1px 1px 0 rgba(0, 0, 0, 0.9)
                `
              : `
                  0 0 10px rgba(150, 150, 150, 0.6),
                  0 2px 4px rgba(0, 0, 0, 0.8),
                  1px 1px 0 rgba(0, 0, 0, 0.9),
                  -1px -1px 0 rgba(0, 0, 0, 0.9),
                  1px -1px 0 rgba(0, 0, 0, 0.9),
                  -1px 1px 0 rgba(0, 0, 0, 0.9)
                `,
          }}
        >
          <span
            className="mr-2"
            style={{
              textShadow: '0 0 8px rgba(255, 206, 87, 0.8), 0 2px 4px rgba(0, 0, 0, 0.6)',
            }}
          >
            ✨
          </span>
          {welcomeText}
        </span>
      </div>
    );
  }, [state.displayName, state.isUserLoading]);

  // Return the form component with welcome message
  return (
    <>
      {FormComponent}
      {WelcomeMessage}
    </>
  );
});

ReactConchShell.displayName = 'ReactConchShell';

export default ReactConchShell;