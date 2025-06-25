import React, { useState } from 'react';
import AuthLogin from './AuthLogin';
import AuthRegister from './AuthRegister';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  redirectTo?: string;
  onSuccess?: () => void;
  onClose?: () => void;
  className?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  initialMode = 'login',
  redirectTo = '/',
  onSuccess,
  onClose,
  className = ''
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    }
  };

  const switchToLogin = () => setMode('login');
  const switchToRegister = () => setMode('register');

  return (
    <div className={`min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 flex items-center justify-center p-4 ${className}`}>
      {mode === 'login' ? (
        <AuthLogin
          redirectTo={redirectTo}
          onSuccess={handleSuccess}
          onSwitchToRegister={switchToRegister}
        />
      ) : (
        <AuthRegister
          redirectTo={redirectTo}
          onSuccess={handleSuccess}
          onSwitchToLogin={switchToLogin}
        />
      )}
      
      {/* Close button if provided */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default AuthModal;
