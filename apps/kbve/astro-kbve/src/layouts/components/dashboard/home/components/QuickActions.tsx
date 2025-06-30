import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { Plus, User, Settings, Bell, ChevronRight } from 'lucide-react';

const QuickActions = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  const quickActions = useMemo(() => [
    { 
      icon: <Plus className="w-5 h-5" />, 
      label: isGuest ? 'Sign Up' : 'Add Credits', 
      color: 'text-cyan-400' 
    },
    { 
      icon: <User className="w-5 h-5" />, 
      label: isGuest ? 'Learn More' : 'Edit Profile', 
      color: 'text-zinc-400' 
    },
    { 
      icon: <Settings className="w-5 h-5" />, 
      label: 'Account Settings', 
      color: 'text-green-400' 
    },
    { 
      icon: <Bell className="w-5 h-5" />, 
      label: 'Notifications', 
      color: 'text-yellow-400' 
    }
  ], [isGuest]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.getElementById('quick-actions-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out, z-index 0s 0.5s';
        skeleton.style.opacity = '0';
        // Move skeleton to lower z-index after fade to avoid hover conflicts
        setTimeout(() => {
          skeleton.style.zIndex = '10';
        }, 500);
      }
      
      setTimeout(() => {
        setVisible(true);
      }, 100);
    };

    const loadComponent = async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
      handleCrossFade();
      setLoading(false);
    };

    loadComponent();
  }, []);

  if (loading) {
    return null;
  }

  return (
    <div className={twMerge(clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700 transition-opacity duration-500",
      visible ? "opacity-100" : "opacity-0"
    ))}>
      <h3 className={twMerge(clsx("text-lg font-semibold text-white mb-4"))}>Quick Actions</h3>
      <div className="space-y-3">
        {quickActions.map((action, index) => (
          <button
            key={index}
            className={twMerge(clsx(
              "w-full flex items-center space-x-3 p-3 rounded-lg",
              "hover:bg-zinc-700 transition-colors text-left"
            ))}
          >
            <span className={twMerge(clsx(action.color))}>{action.icon}</span>
            <span className={twMerge(clsx("text-white"))}>{action.label}</span>
            <ChevronRight className={twMerge(clsx("w-4 h-4 text-zinc-400 ml-auto"))} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
