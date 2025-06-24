import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { Eye, EyeOff, Mail, Lock, User, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import OAuthLogin from './OAuthLogin';

interface AuthRegisterProps {
  redirectTo?: string;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
  className?: string;
}

export const AuthRegister: React.FC<AuthRegisterProps> = ({ 
  redirectTo = '/', 
  onSuccess,
  onSwitchToLogin,
  className = ''
}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const captchaRef = useRef<HCaptcha>(null);

  // hCaptcha site key - using test key for development, replace with your actual site key
  const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001'; // Test key

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const getPasswordStrengthText = (strength: number): string => {
    switch (strength) {
      case 0:
      case 1: return 'Very Weak';
      case 2: return 'Weak';
      case 3: return 'Fair';
      case 4: return 'Good';
      case 5: return 'Strong';
      default: return 'Very Weak';
    }
  };

  const getPasswordStrengthColor = (strength: number): string => {
    switch (strength) {
      case 0:
      case 1: return 'bg-red-500';
      case 2: return 'bg-orange-500';
      case 3: return 'bg-yellow-500';
      case 4: return 'bg-blue-500';
      case 5: return 'bg-green-500';
      default: return 'bg-red-500';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Update password strength
    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }

    // Clear error when user starts typing
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken(null);
  };

  const validateForm = (): string | null => {
    if (!formData.email.trim()) {
      return 'Email is required';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return 'Please enter a valid email address';
    }

    if (!formData.username.trim()) {
      return 'Username is required';
    }

    if (formData.username.length < 3) {
      return 'Username must be at least 3 characters long';
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      return 'Username can only contain letters, numbers, underscores, and hyphens';
    }

    if (!formData.password.trim()) {
      return 'Password is required';
    }

    if (formData.password.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    if (passwordStrength < 3) {
      return 'Password is too weak. Please include uppercase, lowercase, numbers, and special characters';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    if (!captchaToken) {
      return 'Please complete the captcha verification';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      userActions.setLoading(true);
      userActions.setError(null);

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            username: formData.username,
            display_name: formData.username,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.user) {
        if (data.user.email_confirmed_at) {
          // User is already confirmed, they're logged in
          userActions.setAuth(data.session, {
            id: data.user.id,
            email: data.user.email!,
            username: formData.username,
            display_name: formData.username,
          });

          // Reset form
          setFormData({ email: '', password: '', confirmPassword: '', username: '' });
          setCaptchaToken(null);
          captchaRef.current?.resetCaptcha();

          if (onSuccess) {
            onSuccess();
          } else {
            window.location.href = redirectTo;
          }
        } else {
          // User needs to confirm email
          setSuccess(
            `A confirmation email has been sent to ${formData.email}. ` +
            'Please check your inbox and click the confirmation link to complete your registration.'
          );
          
          // Reset form
          setFormData({ email: '', password: '', confirmPassword: '', username: '' });
          setCaptchaToken(null);
          captchaRef.current?.resetCaptcha();
        }
      }
    } catch (err) {
      console.error('Registration error:', err);
      let errorMessage = 'An error occurred during registration';
      
      if (err instanceof Error) {
        if (err.message.includes('User already registered')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (err.message.includes('Password should be')) {
          errorMessage = 'Password does not meet security requirements';
        } else if (err.message.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address';
        } else if (err.message.includes('username')) {
          errorMessage = 'Username is already taken. Please choose a different one.';
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
          <h1 className="text-3xl font-bold text-white mb-2">Join the Meme Community</h1>
          <p className="text-neutral-400">Create your account and start sharing</p>
        </div>

        {/* OAuth Login */}
        <OAuthLogin redirectTo={redirectTo} showTitle={false} className="mb-6" />

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-800 text-neutral-400">or register with email</span>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start space-x-3">
            <CheckCircle size={20} className="text-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-400">{success}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start space-x-3">
            <AlertCircle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Registration Form */}
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

          {/* Username Input */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-neutral-300 mb-2">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={20} className="text-neutral-500" />
              </div>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Choose a username"
                disabled={isLoading}
                required
                minLength={3}
                pattern="^[a-zA-Z0-9_-]+$"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              3+ characters, letters, numbers, underscores, and hyphens only
            </p>
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
                placeholder="Create a strong password"
                disabled={isLoading}
                required
                minLength={8}
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
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-zinc-700 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full transition-all duration-300 ${getPasswordStrengthColor(passwordStrength)}`}
                      style={{ width: `${(passwordStrength / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-400">
                    {getPasswordStrengthText(passwordStrength)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-300 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={20} className="text-neutral-500" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="w-full pl-10 pr-12 py-3 bg-zinc-900/50 border border-zinc-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Confirm your password"
                disabled={isLoading}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                disabled={isLoading}
              >
                {showConfirmPassword ? (
                  <EyeOff size={20} className="text-neutral-500 hover:text-neutral-400" />
                ) : (
                  <Eye size={20} className="text-neutral-500 hover:text-neutral-400" />
                )}
              </button>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
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

          {/* Terms & Conditions */}
          <div className="flex items-start space-x-3 p-3 bg-zinc-900/30 rounded-lg border border-zinc-700">
            <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-neutral-400">
              By creating an account, you agree to our{' '}
              <a href="/terms" className="text-emerald-400 hover:text-emerald-300 underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-emerald-400 hover:text-emerald-300 underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !captchaToken || passwordStrength < 3}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 disabled:from-emerald-500/50 disabled:to-green-500/50 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Creating account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>

        {/* Switch to Login */}
        {onSwitchToLogin && (
          <div className="mt-6 text-center">
            <p className="text-neutral-400">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                disabled={isLoading}
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthRegister;
