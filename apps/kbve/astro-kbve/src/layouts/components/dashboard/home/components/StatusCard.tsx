import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';

interface SystemStatus {
  service: string;
  status: 'operational' | 'warning' | 'error';
  uptime: string;
}

const StatusCard = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus[]>([]);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.getElementById('status-card-skeleton');
      const content = document.getElementById('status-card-content');
      
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

    const fetchSystemStatus = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Set status based on user type
        const statusData: SystemStatus[] = isGuest ? [
          { service: 'Public API', status: 'operational', uptime: '99.9%' },
          { service: 'Website', status: 'operational', uptime: '100%' },
          { service: 'Support', status: 'operational', uptime: '99.8%' }
        ] : [
          { service: 'Account', status: 'operational', uptime: '100%' },
          { service: 'Credits', status: 'operational', uptime: '99.9%' },
          { service: 'Features', status: 'operational', uptime: '99.8%' }
        ];

        setSystemStatus(statusData);
        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching system status:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    fetchSystemStatus();
  }, [isGuest]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-zinc-400';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'operational': return 'bg-green-400';
      case 'warning': return 'bg-yellow-400';
      case 'error': return 'bg-red-400';
      default: return 'bg-zinc-400';
    }
  };

  if (loading) {
    return null; // Skeleton is handled by Astro
  }

  return (
    <div className={twMerge(clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700"
    ))}>
      <h3 className={twMerge(clsx("text-lg font-semibold text-white mb-4"))}>
        {isGuest ? 'Service Status' : 'Account Status'}
      </h3>
      <div className="space-y-3">
        {systemStatus.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className={twMerge(clsx("text-zinc-300 capitalize"))}>{item.service}</span>
            <div className="flex items-center space-x-2">
              <div className={twMerge(clsx(
                "w-3 h-3 rounded-full",
                getStatusDot(item.status)
              ))}></div>
              <span className={twMerge(clsx(
                "text-sm",
                getStatusColor(item.status)
              ))}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusCard;
