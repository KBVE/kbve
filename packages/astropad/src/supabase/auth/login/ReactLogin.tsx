/** @jsxImportSource react */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { loginService, ReactOAuth } from '@kbve/astropad';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};


const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
  const skeleton = document.querySelector('[data-skeleton="login"]') as HTMLElement;
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
            <div className="text-lg font-semibold mb-2">Logging in…</div>
          </>
        )}
        {!loading && (error || success) && (
          <>
            <div className={clsx(
              'text-lg font-semibold mb-2',
              error ? 'text-red-400' : 'text-green-400'
            )}>
              {error || success}
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
      </div>
    </div>
  );
});

export const ReactLogin = () => {
  const email = useStore(loginService.emailAtom);
  const password = useStore(loginService.passwordAtom);
  const error = useStore(loginService.errorAtom);
  const success = useStore(loginService.successAtom);
  const loading = useStore(loginService.loadingAtom);
  const captchaToken = useStore(loginService.captchaTokenAtom);

  const setEmail = (v: string) => loginService.emailAtom.set(v);
  const setPassword = (v: string) => loginService.passwordAtom.set(v);
  const setError = (v: string) => loginService.errorAtom.set(v);
  const setSuccess = (v: string) => loginService.successAtom.set(v);
  const setLoading = (v: boolean) => loginService.loadingAtom.set(v);
  const setCaptchaToken = (v: string | null) => loginService.captchaTokenAtom.set(v);

  type FormValues = {
    email: string;
    password: string;
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
    },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
  const hcaptchaRef = useRef<any>(null);

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
      await loginService.loginUser();
      // Success - reset hCaptcha
      if (hcaptchaRef.current) {
        hcaptchaRef.current.resetCaptcha();
        setCaptchaToken(null);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed.');
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

  // Tooltip handlers for sign-in button
  const handleSignInMouseEnter = useCallback(() => {
    if (!captchaToken) {
      setShowTooltip(true);
      
      // Clear any existing timeout when user hovers
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
    }
  }, [captchaToken, tooltipTimeoutId]);

  const handleSignInMouseLeave = useCallback(() => {
    if (!captchaToken) {
      // Add a delay before hiding tooltip on mouse leave
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1000); // 1 second delay before hiding on mouse leave
      
      setTooltipTimeoutId(timeoutId);
    }
  }, [captchaToken, showTooltip]);

  // Clear tooltip when captcha is solved
  useEffect(() => {
    if (captchaToken && showTooltip) {
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1500); // 1.5 second delay after captcha is solved
      
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
          title="Quick Sign In"
          description="Choose your preferred authentication method"
        />
      </div>

      {/* Divider */}
      <div className="flex items-center my-8">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--sl-color-gray-4)' }}></div>
        <span className="px-4 text-sm font-medium" style={{ color: 'var(--sl-color-gray-3)' }}>or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--sl-color-gray-4)' }}></div>
      </div>
      
      {/* Login Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="login-form flex flex-col gap-5"
        style={{ maxWidth: 400, margin: '0 auto' }}
      >
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--sl-color-white)' }}>
            Sign in with Email
          </h2>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
            Enter your credentials to access your account
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
            className={clsx(
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
            placeholder="Enter your email"
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
          <input
            type="password"
            {...register('password', { 
              required: 'Password is required',
              minLength: {
                value: 6,
                message: 'Password must be at least 6 characters'
              }
            })}
            value={password}
            onChange={handlePasswordChange}
            className={clsx(
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
            placeholder="Enter your password"
          />
          {errors.password && (
            <span className="text-red-400 text-sm">{errors.password.message}</span>
          )}
        </div>

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
          onMouseEnter={handleSignInMouseEnter}
          onMouseLeave={handleSignInMouseLeave}
        >
          <button
            type="submit"
            disabled={loading || !captchaToken}
            className={twMerge(
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
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Signing in...
              </div>
            ) : (
              'Sign In'
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
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 
                border-l-4 border-r-4 border-t-4 border-transparent"
                style={{ borderTopColor: '#dc2626' }}></div>
            </div>
          )}
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-2 pt-4" style={{ borderTop: '1px solid var(--sl-color-gray-5)' }}>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
            Don't have an account?{' '}
            <a data-astro-prefetch
              href="/register"
              className="font-medium transition-colors duration-200 hover:opacity-80"
              style={{ color: 'var(--sl-color-accent)' }}
            >
              Create one here
            </a>
          </p>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-4)' }}>
            <a data-astro-prefetch
              href="/reset"
              className="transition-colors duration-200 hover:opacity-80"
              style={{ color: 'var(--sl-color-gray-3)' }}
            >
              Forgot your password?
            </a>
          </p>
        </div>
      </form>
    </>
  );
};
