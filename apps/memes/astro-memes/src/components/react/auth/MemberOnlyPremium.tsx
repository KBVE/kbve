import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../../../layouts/client/supabase/profile/userstate';
import OAuthLogin from '../../../layouts/core/auth/OAuthLogin';

interface MemberOnlyPremiumProps {
  /** Custom message for non-authenticated users */
  message?: string;
  /** Whether to show the OAuth login component */
  showOAuth?: boolean;
  /** Custom CSS classes */
  className?: string;
}

const MemberOnlyPremium: React.FC<MemberOnlyPremiumProps> = ({ 
  message = "Unlock premium features with a member account.",
  showOAuth = true,
  className = ""
}) => {
  const user = useStore(userAtom);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      await syncSupabaseUser();
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-zinc-400 text-sm">Loading premium features...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className={`bg-gradient-to-br from-yellow-800/50 to-orange-800/50 border border-yellow-500/30 rounded-lg p-6 backdrop-blur-sm ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">👑</div>
          <h2 className="text-2xl font-semibold text-white">Premium Features</h2>
        </div>
        
        <p className="text-neutral-300 mb-6">
          Congratulations! You have access to all premium features.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-700/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-3">🎨 Creative Tools</h3>
            <ul className="text-neutral-300 text-sm space-y-1">
              <li>• Advanced meme editor</li>
              <li>• Custom templates library</li>
              <li>• HD export options</li>
              <li>• Batch processing</li>
            </ul>
          </div>
          
          <div className="bg-zinc-700/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-3">📈 Analytics</h3>
            <ul className="text-neutral-300 text-sm space-y-1">
              <li>• Detailed view statistics</li>
              <li>• Engagement metrics</li>
              <li>• Trending analysis</li>
              <li>• Performance insights</li>
            </ul>
          </div>
          
          <div className="bg-zinc-700/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-3">🚀 Priority Features</h3>
            <ul className="text-neutral-300 text-sm space-y-1">
              <li>• Fast upload queue</li>
              <li>• Priority support</li>
              <li>• Early access features</li>
              <li>• No watermarks</li>
            </ul>
          </div>
          
          <div className="bg-zinc-700/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-400 mb-3">👥 Community</h3>
            <ul className="text-neutral-300 text-sm space-y-1">
              <li>• Private creator groups</li>
              <li>• Exclusive contests</li>
              <li>• Direct creator chat</li>
              <li>• Collaboration tools</li>
            </ul>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-yellow-400 text-sm">
            ✨ Premium features unlocked! You're all set to create amazing content.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-yellow-500/20 rounded-lg p-8 backdrop-blur-sm ${className}`}>
      <div className="text-center">
        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">👑</span>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">Premium Access Required</h3>
        <p className="text-zinc-300 mb-6">{message}</p>

        <div className="bg-zinc-700/30 rounded-lg p-6 mb-6">
          <h4 className="text-lg font-semibold text-yellow-400 mb-4">What You'll Get</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-neutral-300">
            <div>• Advanced creation tools</div>
            <div>• Priority support</div>
            <div>• Detailed analytics</div>
            <div>• Exclusive templates</div>
            <div>• HD exports</div>
            <div>• No watermarks</div>
          </div>
        </div>

        {showOAuth && (
          <div className="bg-zinc-700/30 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Join Our Community</h4>
            <OAuthLogin showTitle={false} className="mb-4" />
            
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-zinc-700 text-neutral-400">or</span>
                </div>
              </div>
              
              <button 
                onClick={() => window.location.href = '/auth/register'}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Start Premium Account
              </button>
            </div>
          </div>
        )}

        {!showOAuth && (
          <div className="space-x-4">
            <button 
              onClick={() => window.location.href = '/auth/login'}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Login
            </button>
            <button 
              onClick={() => window.location.href = '/auth/register'}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Join Premium
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberOnlyPremium;
