/** @jsxImportSource react */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { registerService, ReactOAuth } from '@kbve/astropad';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
  const skeleton = document.querySelector('[data-skeleton="register"]') as HTMLElement;
  if (skeleton) {
    skeleton.style.display = 'none';
  }
};

// Modal component for feedback
const StatusModal = React.memo(({ open, loading, error, success, onClose }: { 
  open: boolean, 
  loading: boolean, 
  error: string, 
  success: string, 
  onClose: () => void 
}) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!open || loading || error || !success) {
      setCountdown(10);
      return;
    }

    // Start countdown only for successful registration
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Redirect to profile page when countdown reaches 0
          window.location.href = '/profile';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, loading, error, success]);

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: 'var(--backdrop-color)' }}>
      <div className="rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative backdrop-blur-md" 
           style={{ 
             backgroundColor: 'var(--sl-color-gray-6)', 
             color: 'var(--sl-color-white)',
             border: '1px solid var(--sl-color-gray-5)'
           }}>
        {loading && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 mb-4" 
                 style={{ borderTopColor: 'var(--sl-color-accent)', borderBottomColor: 'var(--sl-color-accent)' }}></div>
            <div className="text-lg font-semibold mb-2">Processing registration…</div>
          </>
        )}
        {!loading && error && (
          <>
            <div className="text-red-400 text-lg font-semibold mb-2">
              {error}
            </div>
            <button 
              onClick={onClose} 
              className="mt-4 px-4 py-2 rounded-lg font-bold shadow-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{ 
                backgroundColor: 'var(--sl-color-accent)',
                color: 'var(--sl-color-white)',
                '--tw-ring-color': 'var(--sl-color-accent)'
              } as any}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-accent-high)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-accent)';
              }}
            >
              Close
            </button>
          </>
        )}
        {!loading && success && (
          <>
            <div className="text-green-400 text-lg font-semibold mb-4">
              {success}
            </div>
            <div className="text-center mb-4">
              <div className="text-sm mb-2" style={{ color: 'var(--sl-color-gray-3)' }}>
                Redirecting to your profile in {countdown} seconds...
              </div>
              <div className="w-full rounded-full h-2 mb-3" style={{ backgroundColor: 'var(--sl-color-gray-5)' }}>
                <div 
                  className="h-2 rounded-full transition-all duration-1000"
                  style={{ 
                    backgroundColor: 'var(--sl-color-accent)',
                    width: `${((10 - countdown) / 10) * 100}%`
                  }}
                ></div>
              </div>
            </div>
            <div className="flex gap-2">
              <a 
                href="/profile" 
                className="px-4 py-2 rounded-lg font-bold shadow-lg transition-colors duration-200"
                style={{ 
                  backgroundColor: 'var(--sl-color-accent)',
                  color: 'var(--sl-color-white)'
                }}
              >
                Go to Profile
              </a>
              <button 
                onClick={onClose} 
                className="px-4 py-2 rounded-lg font-bold shadow-lg transition-colors duration-200"
                style={{ 
                  backgroundColor: 'var(--sl-color-gray-5)',
                  color: 'var(--sl-color-white)'
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export const ReactRegister = () => {
  const email = useStore(registerService.emailAtom);
  const password = useStore(registerService.passwordAtom);
  const confirmPassword = useStore(registerService.confirmPasswordAtom);
  const displayName = useStore(registerService.displayNameAtom);
  const agreed = useStore(registerService.agreedAtom);
  const error = useStore(registerService.errorAtom);
  const success = useStore(registerService.successAtom);
  const loading = useStore(registerService.loadingAtom);
  const captchaToken = useStore(registerService.captchaTokenAtom);

  const setEmail = (v: string) => registerService.emailAtom.set(v);
  const setPassword = (v: string) => registerService.passwordAtom.set(v);
  const setConfirmPassword = (v: string) => registerService.confirmPasswordAtom.set(v);
  const setDisplayName = (v: string) => registerService.displayNameAtom.set(v);
  const setAgreed = (v: boolean) => registerService.agreedAtom.set(v);
  const setError = (v: string) => registerService.errorAtom.set(v);
  const setSuccess = (v: string) => registerService.successAtom.set(v);
  const setLoading = (v: boolean) => registerService.loadingAtom.set(v);
  const setCaptchaToken = (v: string | null) => registerService.captchaTokenAtom.set(v);

  type FormValues = {
    email: string;
    password: string;
    confirmPassword: string;
    displayName: string;
    agreed: boolean;
  };

  const {
    handleSubmit,
    register,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      email,
      password,
      confirmPassword,
      displayName,
      agreed,
    },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
  const hcaptchaRef = useRef<any>(null);

  const passwordValidation = registerService.validatePassword(password);

  // Hide skeleton on component mount
  useEffect(() => {
    hideSkeleton();
  }, []);

  // Memoized submit handler
  const onSubmit = useCallback(async (data: FormValues) => {
    setError('');
    setSuccess('');
    setModalOpen(true);
    
    if (!captchaToken) {
      setError('Please complete the hCaptcha challenge.');
      setModalOpen(false);
      return;
    }
    
    setLoading(true);
    try {
      await registerService.registerUser();
      // Success - reset hCaptcha
      if (hcaptchaRef.current) {
        hcaptchaRef.current.resetCaptcha();
        setCaptchaToken(null);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
      // Error - reset hCaptcha
      if (hcaptchaRef.current) {
        hcaptchaRef.current.resetCaptcha();
        setCaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, [captchaToken, setError, setSuccess, setLoading, setCaptchaToken]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  // Memoized input change handlers
  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setValue('email', value);
  }, [setEmail, setValue]);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setValue('password', value);
  }, [setPassword, setValue]);

  const handleConfirmPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    setValue('confirmPassword', value);
  }, [setConfirmPassword, setValue]);

  const handleDisplayNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDisplayName(value);
    setValue('displayName', value);
  }, [setDisplayName, setValue]);

  const handleAgreedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    setAgreed(value);
    setValue('agreed', value);
  }, [setAgreed, setValue]);

  // Tooltip handlers for submit button
  const handleSubmitMouseEnter = useCallback(() => {
    if (!captchaToken) {
      setShowTooltip(true);
      
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
    }
  }, [captchaToken, tooltipTimeoutId]);

  const handleSubmitMouseLeave = useCallback(() => {
    if (!captchaToken) {
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1000);
      
      setTooltipTimeoutId(timeoutId);
    }
  }, [captchaToken, showTooltip]);

  // Clear tooltip when captcha is solved
  useEffect(() => {
    if (captchaToken && showTooltip) {
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1500);
      
      setTooltipTimeoutId(timeoutId);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [captchaToken, showTooltip]);

  return (
    <>
      <StatusModal 
        open={modalOpen} 
        loading={loading} 
        error={error} 
        success={success} 
        onClose={handleCloseModal} 
      />
      
      {/* OAuth Component */}
      <div className="mb-8">
        <ReactOAuth 
          captchaToken={captchaToken} 
          captchaRef={hcaptchaRef}
          title="Quick Sign Up"
          description="Choose your preferred registration method"
        />
      </div>

      {/* Divider */}
      <div className="flex items-center my-8">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--sl-color-gray-4)' }}></div>
        <span className="px-4 text-sm font-medium" style={{ color: 'var(--sl-color-gray-3)' }}>or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--sl-color-gray-4)' }}></div>
      </div>
      
      {/* Registration Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="register-form flex flex-col gap-5"
        style={{ maxWidth: 400, margin: '0 auto' }}
      >
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--sl-color-white)' }}>
            Create Account
          </h2>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
            Fill in your details to get started
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 rounded-lg border text-center text-sm" 
               style={{ 
                 backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                 borderColor: 'rgba(239, 68, 68, 0.2)',
                 color: '#f87171'
               }}>
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg border text-center text-sm"
               style={{ 
                 backgroundColor: 'rgba(34, 197, 94, 0.1)', 
                 borderColor: 'rgba(34, 197, 94, 0.2)',
                 color: '#4ade80'
               }}>
            {success}
          </div>
        )}

        {/* Display Name Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'var(--sl-color-gray-2)' }}>
            Display Name
          </label>
          <input
            type="text"
            {...register('displayName', {
              required: 'Display name is required',
              maxLength: {
                value: 32,
                message: 'Display name cannot exceed 32 characters',
              },
              pattern: {
                value: /^[a-zA-Z0-9 _-]+$/,
                message: 'Display name can only contain letters, numbers, spaces, _ and -',
              },
            })}
            value={displayName}
            onChange={handleDisplayNameChange}
            className={cn(
              'block w-full rounded-lg border px-4 py-3 transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:border-transparent',
              errors.displayName 
                ? 'border-red-500 focus:ring-red-500' 
                : 'hover:border-opacity-80'
            )}
            style={{
              backgroundColor: 'var(--sl-color-gray-5)',
              color: 'var(--sl-color-white)',
              borderColor: errors.displayName ? '#ef4444' : 'var(--sl-color-gray-4)'
            }}
            placeholder="Your display name"
            maxLength={32}
          />
          <p className="text-xs" style={{ color: 'var(--sl-color-gray-4)' }}>
            Letters, numbers, spaces, _ and - only
          </p>
          {errors.displayName && (
            <span className="text-red-400 text-sm">{errors.displayName.message}</span>
          )}
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'var(--sl-color-gray-2)' }}>
            Email Address
          </label>
          <input
            type="email"
            {...register('email', { 
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address'
              }
            })}
            value={email}
            onChange={handleEmailChange}
            className={cn(
              'block w-full rounded-lg border px-4 py-3 transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:border-transparent',
              errors.email 
                ? 'border-red-500 focus:ring-red-500' 
                : 'hover:border-opacity-80'
            )}
            style={{
              backgroundColor: 'var(--sl-color-gray-5)',
              color: 'var(--sl-color-white)',
              borderColor: errors.email ? '#ef4444' : 'var(--sl-color-gray-4)'
            }}
            placeholder="your@email.com"
          />
          {errors.email && (
            <span className="text-red-400 text-sm">{errors.email.message}</span>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'var(--sl-color-gray-2)' }}>
            Password
          </label>
          <div className="relative">
            <input
              type="password"
              {...register('password', {
                required: 'Password is required',
                validate: registerService.getPasswordValidationMessage,
              })}
              value={password}
              onChange={handlePasswordChange}
              onFocus={() => setShowPasswordTooltip(true)}
              onBlur={() => setShowPasswordTooltip(false)}
              className={cn(
                'block w-full rounded-lg border px-4 py-3 transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:border-transparent',
                errors.password 
                  ? 'border-red-500 focus:ring-red-500' 
                  : 'hover:border-opacity-80'
              )}
              style={{
                backgroundColor: 'var(--sl-color-gray-5)',
                color: 'var(--sl-color-white)',
                borderColor: errors.password ? '#ef4444' : 'var(--sl-color-gray-4)'
              }}
              placeholder="Create a strong password"
            />
            {showPasswordTooltip && (
              <div className="absolute left-0 z-10 mt-2 w-full rounded-lg border text-white text-xs p-4 shadow-xl space-y-2"
                   style={{ 
                     backgroundColor: 'var(--sl-color-gray-6)', 
                     borderColor: 'var(--sl-color-gray-5)'
                   }}>
                <p className="font-medium mb-2" style={{ color: 'var(--sl-color-gray-3)' }}>
                  Password requirements:
                </p>
                <div className={passwordValidation.length ? 'text-green-400' : 'text-red-400'}>
                  {passwordValidation.length ? '✓' : '✗'} At least 8 characters
                </div>
                <div className={passwordValidation.upper ? 'text-green-400' : 'text-red-400'}>
                  {passwordValidation.upper ? '✓' : '✗'} At least 1 uppercase letter
                </div>
                <div className={passwordValidation.lower ? 'text-green-400' : 'text-red-400'}>
                  {passwordValidation.lower ? '✓' : '✗'} At least 1 lowercase letter
                </div>
                <div className={passwordValidation.number ? 'text-green-400' : 'text-red-400'}>
                  {passwordValidation.number ? '✓' : '✗'} At least 1 number
                </div>
                <div className={passwordValidation.special ? 'text-green-400' : 'text-red-400'}>
                  {passwordValidation.special ? '✓' : '✗'} At least 1 special character
                </div>
              </div>
            )}
          </div>
          {errors.password && (
            <span className="text-red-400 text-sm">{errors.password.message}</span>
          )}
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'var(--sl-color-gray-2)' }}>
            Confirm Password
          </label>
          <input
            type="password"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: value => value === password || 'Passwords do not match',
            })}
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            className={cn(
              'block w-full rounded-lg border px-4 py-3 transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:border-transparent',
              errors.confirmPassword 
                ? 'border-red-500 focus:ring-red-500' 
                : 'hover:border-opacity-80'
            )}
            style={{
              backgroundColor: 'var(--sl-color-gray-5)',
              color: 'var(--sl-color-white)',
              borderColor: errors.confirmPassword ? '#ef4444' : 'var(--sl-color-gray-4)'
            }}
            placeholder="Confirm your password"
          />
          {errors.confirmPassword && (
            <span className="text-red-400 text-sm">{errors.confirmPassword.message}</span>
          )}
        </div>

        {/* Terms Agreement */}
        <div className="flex items-start gap-3 my-6">
          <input
            type="checkbox"
            id="legal-agree"
            {...register('agreed', { required: 'You must agree to the legal terms.' })}
            checked={agreed}
            onChange={handleAgreedChange}
            className="mt-1 w-4 h-4 rounded focus:ring-2 focus:ring-offset-2"
            style={{
              backgroundColor: 'var(--sl-color-gray-5)',
              borderColor: 'var(--sl-color-gray-4)',
              color: 'var(--sl-color-accent)'
            }}
          />
          <label htmlFor="legal-agree" className="text-sm leading-relaxed" style={{ color: 'var(--sl-color-gray-3)' }}>
            I agree to the{' '}
            <a
              href="https://kbve.com/legal/"
              target="_blank" 
              rel="noopener noreferrer" 
              className="underline underline-offset-2 transition-colors duration-300"
              style={{ color: 'var(--sl-color-accent)' }}
            >
              Terms of Service
            </a>
            {' '}and{' '}
            <a
              href="https://kbve.com/privacy/"
              target="_blank" 
              rel="noopener noreferrer" 
              className="underline underline-offset-2 transition-colors duration-300"
              style={{ color: 'var(--sl-color-accent)' }}
            >
              Privacy Policy
            </a>
          </label>
        </div>
        {errors.agreed && (
          <span className="text-red-400 text-sm">{errors.agreed.message}</span>
        )}

        {/* hCaptcha */}
        <div className="flex justify-center my-4">
          <HCaptcha
            ref={hcaptchaRef}
            sitekey={HCAPTCHA_SITE_KEY}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
            theme="dark"
          />
        </div>

        {/* Submit Button */}
        <div 
          className="relative"
          onMouseEnter={handleSubmitMouseEnter}
          onMouseLeave={handleSubmitMouseLeave}
        >
          <button
            type="submit"
            disabled={loading || !captchaToken}
            className={cn(
              'w-full py-3 px-4 rounded-lg font-semibold shadow-lg',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              'transition-all duration-200 transform active:scale-[0.98]',
              (loading || !captchaToken) && 'opacity-60 cursor-not-allowed'
            )}
            style={{
              backgroundColor: 'var(--sl-color-accent)',
              color: 'var(--sl-color-white)',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if (!loading && captchaToken) {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-accent-high)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && captchaToken) {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-accent)';
              }
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Creating Account...</span>
              </div>
            ) : (
              'Create Account'
            )}
          </button>
          
          {/* Tooltip */}
          {showTooltip && !captchaToken && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 
              text-sm rounded-lg shadow-lg z-50 whitespace-nowrap pointer-events-none"
              style={{
                backgroundColor: '#dc2626',
                color: 'var(--sl-color-white)'
              }}>
              Please complete the captcha to continue
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-[#dc2626]" />
            </div>
          )}
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-2 pt-4" style={{ borderTop: '1px solid var(--sl-color-gray-5)' }}>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium transition-colors duration-200 hover:opacity-80"
              style={{ color: 'var(--sl-color-accent)' }}
            >
              Sign in here
            </a>
          </p>
        </div>
      </form>
    </>
  );
};