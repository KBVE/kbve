import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { Plus, User, Settings, Bell, ChevronRight } from 'lucide-react';

const QuickActions = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);

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
      const content = document.getElementById('quick-actions-content');
      
      if (skeleton && content) {
        // Hide skeleton and show content
        skeleton.style.opacity = '0';
        content.style.opacity = '1';
        
        // After transition, hide skeleton completely to free up space
        setTimeout(() => {
          skeleton.style.display = 'none';
        }, 500);
      }
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
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700",
      "relative overflow-hidden group/container",
      "hover:border-zinc-600 transition-all duration-300",
      "hover:shadow-xl hover:shadow-cyan-400/5"
    ))}>
      {/* Subtle background animation */}
      <div className={twMerge(clsx(
        "absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-transparent to-transparent",
        "opacity-0 group-hover/container:opacity-100 transition-opacity duration-500"
      ))} />
      
      <h3 className={twMerge(clsx(
        "text-lg font-semibold text-white mb-4 relative z-10",
        "transition-all duration-300",
        "group-hover/container:text-cyan-100"
      ))}>
        Quick Actions
      </h3>
      <div className="space-y-3">
        {quickActions.map((action, index) => (
          <button
            key={index}
            className={twMerge(clsx(
              "w-full flex items-center space-x-3 p-3 rounded-lg text-left group",
              "relative overflow-hidden",
              "hover:bg-zinc-700/50 hover:border-zinc-600 hover:shadow-lg",
              "hover:scale-[1.02] hover:-translate-y-0.5",
              "transition-all duration-300 ease-out",
              "border border-transparent",
              "backdrop-blur-sm"
            ))}
          >
            {/* Hover glow effect */}
            <div className={twMerge(clsx(
              "absolute inset-0 rounded-lg opacity-0 group-hover:opacity-20",
              "bg-gradient-to-r from-cyan-400/10 via-transparent to-cyan-400/10",
              "transition-opacity duration-300"
            ))} />
            
            {/* Icon with enhanced hover effects */}
            <span className={twMerge(clsx(
              action.color,
              "relative z-10 transition-all duration-300",
              "group-hover:scale-110 group-hover:drop-shadow-lg",
              "group-hover:brightness-125"
            ))}>
              {action.icon}
            </span>
            
            {/* Label with slide effect */}
            <span className={twMerge(clsx(
              "text-white relative z-10 font-medium",
              "transition-all duration-300",
              "group-hover:translate-x-1 group-hover:text-cyan-100"
            ))}>
              {action.label}
            </span>
            
            {/* Enhanced chevron with rotation and movement */}
            <ChevronRight className={twMerge(clsx(
              "w-4 h-4 text-zinc-400 ml-auto relative z-10",
              "transition-all duration-300",
              "group-hover:text-cyan-400 group-hover:translate-x-1",
              "group-hover:rotate-12 group-hover:scale-110"
            ))} />
            
            {/* Subtle border glow on hover */}
            <div className={twMerge(clsx(
              "absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100",
              "ring-1 ring-cyan-400/20 transition-opacity duration-300"
            ))} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
