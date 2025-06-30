import React, { useState, useRef, useEffect, useCallback } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { clsx, twMerge } from 'src/utils/tw';
import {
  emailAtom,
  passwordAtom,
  errorAtom,
  successAtom,
  captchaTokenAtom,
  loadingAtom,
} from './loginstatestate';
import { loginUser } from './factory-login';
import { signInWithDiscord, signInWithGithub, SolanaSignInButton } from '../auth/OAuthSignIn';

const HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
  const skeleton = document.querySelector('[data-skeleton="login"]');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 text-white rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative
        border border-neutral-700/50 backdrop-blur-md">
        {loading && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-400 mb-4"></div>
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
              className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold shadow-lg
                transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export const Login = () => {
  const email = useStore(emailAtom);
  const password = useStore(passwordAtom);
  const error = useStore(errorAtom);
  const success = useStore(successAtom);
  const loading = useStore(loadingAtom);
  const captchaToken = useStore(captchaTokenAtom);

  const setEmail = (v: string) => emailAtom.set(v);
  const setPassword = (v: string) => passwordAtom.set(v);
  const setError = (v: string) => errorAtom.set(v);
  const setSuccess = (v: string) => successAtom.set(v);
  const setLoading = (v: boolean) => loadingAtom.set(v);
  const setCaptchaToken = (v: string | null) => captchaTokenAtom.set(v);

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
      await loginUser();
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
      // Reset hCaptcha after submission attempt
      if (hcaptchaRef.current) {
        hcaptchaRef.current.reset();
        setCaptchaToken(null);
      }
    }
  }, [captchaToken, setError, setSuccess, setLoading, setCaptchaToken]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  // Memoized OAuth handlers
  const handleGithubSignIn = useCallback(() => {
    signInWithGithub();
  }, []);

  const handleDiscordSignIn = useCallback(() => {
    signInWithDiscord();
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

  return (
    <>
      <StatusModal 
        open={modalOpen} 
        loading={loading} 
        error={error} 
        success={success} 
        onClose={handleCloseModal} 
      />
      
      {/* OAuth Buttons */}
      <div className="flex flex-col gap-3 mb-8">
        <button
          onClick={handleGithubSignIn}
          className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl 
            bg-zinc-900 hover:bg-zinc-800 text-white font-semibold shadow-lg 
            border border-zinc-700/50 hover:border-zinc-600/50
            transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/>
          </svg>
          Continue with GitHub
        </button>
        
        <button
          onClick={handleDiscordSignIn}
          className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl 
            bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold shadow-lg 
            border border-[#5865F2]/50 hover:border-[#4752c4]/50
            transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-2"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
          </svg>
          Continue with Discord
        </button>
        
        <SolanaSignInButton captchaToken={captchaToken} captchaRef={hcaptchaRef} />
      </div>

      {/* Divider */}
      <div className="flex items-center my-8">
        <div className="flex-1 h-px bg-zinc-600"></div>
        <span className="px-4 text-sm text-zinc-400 font-medium">or</span>
        <div className="flex-1 h-px bg-zinc-600"></div>
      </div>
      
      {/* Login Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="login-form flex flex-col gap-5"
        style={{ maxWidth: 400, margin: '0 auto' }}
      >
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Sign in with Email
          </h2>
          <p className="text-zinc-400 text-sm">
            Enter your credentials to access your account
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-center text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-center text-sm">
            {success}
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
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
              'block w-full rounded-lg border px-4 py-3 bg-zinc-800/50 text-white placeholder-zinc-400',
              'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent',
              'transition-all duration-200',
              errors.email 
                ? 'border-red-500 focus:ring-red-500' 
                : 'border-zinc-600 hover:border-zinc-500'
            )}
            placeholder="Enter your email"
          />
          {errors.email && (
            <span className="text-red-400 text-sm">{errors.email.message}</span>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
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
              'block w-full rounded-lg border px-4 py-3 bg-zinc-800/50 text-white placeholder-zinc-400',
              'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent',
              'transition-all duration-200',
              errors.password 
                ? 'border-red-500 focus:ring-red-500' 
                : 'border-zinc-600 hover:border-zinc-500'
            )}
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
        <button
          type="submit"
          disabled={loading || !captchaToken}
          className={twMerge(
            'w-full py-3 px-4 rounded-lg font-semibold text-white shadow-lg',
            'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
            'transition-all duration-200 transform active:scale-[0.98]',
            (loading || !captchaToken) && 'opacity-60 cursor-not-allowed hover:from-cyan-500 hover:to-purple-500'
          )}
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

        {/* Footer Links */}
        <div className="text-center space-y-2 pt-4 border-t border-zinc-700/50">
          <p className="text-zinc-400 text-sm">
            Don't have an account?{' '}
            <a 
              href="/register" 
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors duration-200"
            >
              Create one here
            </a>
          </p>
          <p className="text-zinc-500 text-sm">
            <a 
              href="/reset" 
              className="hover:text-zinc-400 transition-colors duration-200"
            >
              Forgot your password?
            </a>
          </p>
        </div>
      </form>
    </>
  );
};
