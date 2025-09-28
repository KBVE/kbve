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
      color: 'text-cyan-400',
      url: isGuest ? '/auth/signup' : '/dashboard/credits'
    },
    { 
      icon: <User className="w-5 h-5" />, 
      label: isGuest ? 'Learn More' : 'Edit Profile', 
      color: 'text-zinc-400',
      url: isGuest ? '/about' : '/dashboard/profile'
    },
    { 
      icon: <Settings className="w-5 h-5" />, 
      label: 'Account Settings', 
      color: 'text-green-400',
      url: '/dashboard/settings'
    },
    { 
      icon: <Bell className="w-5 h-5" />, 
      label: 'Notifications', 
      color: 'text-yellow-400',
      url: '/dashboard/notifications'
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
      "relative overflow-hidden group/container",
      "bg-zinc-800/40 backdrop-blur-xl border border-zinc-700/50",
      "rounded-xl p-6 shadow-2xl shadow-inner shadow-zinc-900/30",
      "hover:border-zinc-600/60 transition-all duration-500",
      "hover:shadow-xl hover:shadow-cyan-400/10",
      "hover:shadow-inner hover:shadow-zinc-900/50",
      "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:rounded-xl",
      "after:absolute after:inset-px after:bg-gradient-to-br after:from-zinc-700/20 after:to-zinc-800/20 after:rounded-xl after:-z-10"
    ))}>
      {/* Glassmorphic background layers */}
      <div className={twMerge(clsx(
        "absolute inset-0 bg-gradient-to-br from-cyan-400/3 via-transparent to-zinc-900/20",
        "opacity-0 group-hover/container:opacity-100 transition-opacity duration-700 rounded-xl"
      ))} />
      
      {/* Animated light reflection */}
      <div className={twMerge(clsx(
        "absolute -top-1/2 -left-1/2 w-full h-full",
        "bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent",
        "opacity-0 group-hover/container:opacity-100 transition-all duration-1000",
        "transform rotate-12 group-hover/container:rotate-45 blur-xl"
      ))} />
      
      <h3 className={twMerge(clsx(
        "text-lg font-semibold text-white mb-6 relative z-10",
        "transition-all duration-300",
        "group-hover/container:text-cyan-100",
        "drop-shadow-sm"
      ))}>
        Quick Actions
      </h3>
      <div className="space-y-4 relative z-10">
        {quickActions.map((action, index) => (
          <a
            key={index}
            href={action.url}
            className={twMerge(clsx(
              "block w-full group/card perspective-1000"
            ))}
          >
            <div className={twMerge(clsx(
              "relative p-4 rounded-xl text-left",
              "bg-zinc-800/60 backdrop-blur-md border border-zinc-700/40",
              "transform-gpu transition-all duration-500 ease-out",
              "hover:scale-[1.03] hover:-translate-y-1 hover:rotate-x-3 hover:rotate-y-1",
              "hover:shadow-2xl hover:shadow-cyan-400/20",
              "hover:border-zinc-600/60 hover:bg-zinc-700/50",
              "preserve-3d transform-style-3d",
              "shadow-inner shadow-zinc-900/40",
              "hover:shadow-inner hover:shadow-zinc-900/60",
              "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/8 before:to-transparent before:rounded-xl before:opacity-0 before:hover:opacity-100 before:transition-opacity before:duration-300",
              "after:absolute after:inset-px after:bg-gradient-to-br after:from-zinc-600/10 after:to-zinc-800/30 after:rounded-xl after:-z-10"
            ))}>
              
              {/* 3D Inner card effect */}
              <div className={twMerge(clsx(
                "relative z-20 flex items-center space-x-4",
                "transform-gpu transition-transform duration-300",
                "group-hover/card:translate-z-4"
              ))}>
                
                {/* Icon with enhanced 3D effects */}
                <div className={twMerge(clsx(
                  "relative p-2 rounded-lg",
                  "bg-zinc-700/50 border border-zinc-600/30 backdrop-blur-sm",
                  "transition-all duration-300 transform-gpu",
                  "group-hover/card:scale-110 group-hover/card:rotate-12",
                  "group-hover/card:shadow-lg group-hover/card:translate-z-8",
                  "shadow-inner shadow-zinc-800/60",
                  "group-hover/card:shadow-inner group-hover/card:shadow-zinc-800/80",
                  "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:to-transparent before:rounded-lg"
                ))}>
                  <span className={twMerge(clsx(
                    action.color,
                    "relative z-10 block transition-all duration-300",
                    "group-hover/card:brightness-125 group-hover/card:drop-shadow-lg",
                    "group-hover/card:filter group-hover/card:saturate-150"
                  ))}>
                    {action.icon}
                  </span>
                </div>
                
                {/* Label with enhanced typography */}
                <div className="flex-1">
                  <span className={twMerge(clsx(
                    "text-white font-medium text-base block",
                    "transition-all duration-300 transform-gpu",
                    "group-hover/card:text-cyan-100 group-hover/card:translate-x-1",
                    "group-hover/card:translate-z-2 drop-shadow-sm"
                  ))}>
                    {action.label}
                  </span>
                </div>
                
                {/* Enhanced chevron with 3D movement */}
                <div className={twMerge(clsx(
                  "transition-all duration-300 transform-gpu",
                  "group-hover/card:translate-x-2 group-hover/card:translate-z-4"
                ))}>
                  <ChevronRight className={twMerge(clsx(
                    "w-5 h-5 text-zinc-400",
                    "transition-all duration-300",
                    "group-hover/card:text-cyan-400 group-hover/card:scale-125",
                    "group-hover/card:rotate-12 drop-shadow-sm"
                  ))} />
                </div>
              </div>
              
              {/* Glassmorphic hover overlay */}
              <div className={twMerge(clsx(
                "absolute inset-0 rounded-xl opacity-0 group-hover/card:opacity-100",
                "bg-gradient-to-r from-cyan-400/5 via-transparent to-cyan-400/5",
                "transition-opacity duration-500"
              ))} />
              
              {/* Subtle glow effect */}
              <div className={twMerge(clsx(
                "absolute inset-0 rounded-xl opacity-0 group-hover/card:opacity-100",
                "ring-1 ring-cyan-400/20 transition-opacity duration-300",
                "shadow-lg shadow-cyan-400/10"
              ))} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;

// Add some CSS for enhanced 3D effects
const styles = `
  .perspective-1000 {
    perspective: 1000px;
  }
  
  .preserve-3d {
    transform-style: preserve-3d;
  }
  
  .transform-style-3d {
    transform-style: preserve-3d;
  }
  
  .translate-z-2 {
    transform: translateZ(2px);
  }
  
  .translate-z-4 {
    transform: translateZ(4px);
  }
  
  .translate-z-8 {
    transform: translateZ(8px);
  }
  
  .rotate-x-3 {
    transform: rotateX(3deg);
  }
  
  .rotate-y-1 {
    transform: rotateY(1deg);
  }
`;
