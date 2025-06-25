import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import OAuthLogin from './OAuthLogin';

interface AuthLoginProps {
  redirectTo?: string;
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
  className?: string;
}

export const AuthLogin: React.FC<AuthLoginProps> = ({ 
  redirectTo = '/', 
  onSuccess,
  onSwitchToRegister,
  className = ''
}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  // hCaptcha site key - using test key for development, replace with your actual site key
  const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001'; // Test key

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    if (!formData.password.trim()) {
      setError('Password is required');
      return;
    }

    if (!captchaToken) {
      setError('Please complete the captcha verification');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      userActions.setLoading(true);
      userActions.setError(null);

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        throw signInError;
      }

      if (data.user) {
        // Update user store
        userActions.setAuth(data.session, {
          id: data.user.id,
          email: data.user.email!,
          username: data.user.user_metadata?.username,
          avatar_url: data.user.user_metadata?.avatar_url,
          full_name: data.user.user_metadata?.full_name,
        });

        // Reset form
        setFormData({ email: '', password: '' });
        setCaptchaToken(null);
        captchaRef.current?.resetCaptcha();

        // Call success callback or redirect
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.href = redirectTo;
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage = 'An error occurred during sign in';
      
      if (err instanceof Error) {
        if (err.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password';
        } else if (err.message.includes('Email not confirmed')) {
          errorMessage = 'Please confirm your email address before signing in';
        } else if (err.message.includes('Too many requests')) {
          errorMessage = 'Too many attempts. Please try again later';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      userActions.setError(errorMessage);
      
      // Reset captcha on error
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    } finally {
      setIsLoading(false);
      userActions.setLoading(false);
    }
  };

  return (
    <div className={`max-w-md mx-auto ${className}`}>
      <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-zinc-700">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-neutral-400">Sign in to your meme account</p>
        </div>

        {/* OAuth Login */}
        <OAuthLogin redirectTo={redirectTo} showTitle={false} className="mb-6" />

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-800 text-neutral-400">or continue with email</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start space-x-3">
            <AlertCircle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={20} className="text-neutral-500" />
              </div>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Enter your email"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={20} className="text-neutral-500" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full pl-10 pr-12 py-3 bg-zinc-900/50 border border-zinc-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Enter your password"
                disabled={isLoading}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff size={20} className="text-neutral-500 hover:text-neutral-400" />
                ) : (
                  <Eye size={20} className="text-neutral-500 hover:text-neutral-400" />
                )}
              </button>
            </div>
          </div>

          {/* hCaptcha */}
          <div className="flex justify-center">
            <HCaptcha
              ref={captchaRef}
              sitekey={HCAPTCHA_SITE_KEY}
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              theme="dark"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !captchaToken}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 disabled:from-emerald-500/50 disabled:to-green-500/50 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Switch to Register */}
        {onSwitchToRegister && (
          <div className="mt-6 text-center">
            <p className="text-neutral-400">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToRegister}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                disabled={isLoading}
              >
                Sign up
              </button>
            </p>
          </div>
        )}

        {/* Forgot Password */}
        <div className="mt-4 text-center">
          <button
            type="button"
            className="text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
            disabled={isLoading}
            onClick={() => {
              // TODO: Implement forgot password functionality
              alert('Forgot password functionality coming soon!');
            }}
          >
            Forgot your password?
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthLogin;
