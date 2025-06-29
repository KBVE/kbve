import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { Wallet, User, Award, Activity, ChevronRight } from 'lucide-react';

interface UserActivityItem {
  id: string;
  type: 'credit' | 'profile' | 'achievement' | 'login';
  message: string;
  timestamp: Date;
  status?: 'success' | 'info' | 'warning';
}

const ActivityFeed = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<UserActivityItem[]>([]);
  const [visible, setVisible] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);
  const username = useMemo(() => 
    isGuest ? 'Guest' : (user?.email?.split('@')[0] || 'User'), 
    [isGuest, user]
  );

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.getElementById('activity-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out';
        skeleton.style.opacity = '0';
      }
      
      setTimeout(() => {
        setVisible(true);
      }, 100);
    };

    const fetchUserActivities = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const userActivities: UserActivityItem[] = isGuest ? [
          {
            id: '1',
            type: 'login',
            message: 'Welcome! Sign up to unlock all features',
            timestamp: new Date(),
            status: 'info'
          }
        ] : [
          {
            id: '1',
            type: 'login',
            message: `Welcome back, ${username}!`,
            timestamp: new Date(Date.now() - 2 * 60 * 1000),
            status: 'success'
          },
          {
            id: '2',
            type: 'credit',
            message: 'Daily login bonus credited',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
            status: 'success'
          },
          {
            id: '3',
            type: 'profile',
            message: 'Profile viewed by 3 users',
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            status: 'info'
          },
          {
            id: '4',
            type: 'achievement',
            message: 'Completed weekly challenge',
            timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            status: 'success'
          }
        ];

        setActivities(userActivities);
        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user activities:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    fetchUserActivities();
  }, [isGuest, username]);

  const formatTimeAgo = useMemo(() => (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }, []);

  const getActivityIcon = useMemo(() => (type: string) => {
    switch (type) {
      case 'credit': return <Wallet className="w-4 h-4" />;
      case 'profile': return <User className="w-4 h-4" />;
      case 'achievement': return <Award className="w-4 h-4" />;
      case 'login': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  }, []);

  if (loading) {
    return null;
  }

  return (
    <div className={twMerge(clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700 transition-opacity duration-500",
      visible ? "opacity-100" : "opacity-0"
    ))}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={twMerge(clsx("text-xl font-semibold text-white"))}>Recent Activity</h3>
        {!isGuest && (
          <button className={twMerge(clsx(
            "px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg",
            "text-sm font-medium transition-colors"
          ))}>
            View All
          </button>
        )}
      </div>
      <div className="space-y-4">
        {activities.length > 0 ? activities.map((activity) => (
          <div key={activity.id} className={twMerge(clsx(
            "flex items-start space-x-3 p-3 rounded-lg",
            "hover:bg-zinc-700/50 transition-colors"
          ))}>
            <div className={twMerge(clsx(
              "p-2 rounded-lg",
              activity.status === 'success' ? 'bg-green-500/10 text-green-400' :
              activity.status === 'info' ? 'bg-blue-500/10 text-blue-400' :
              'bg-zinc-700 text-zinc-400'
            ))}>
              {getActivityIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={twMerge(clsx("text-white text-sm"))}>{activity.message}</p>
              <p className={twMerge(clsx("text-zinc-400 text-xs mt-1"))}>
                {formatTimeAgo(activity.timestamp)}
              </p>
            </div>
            <ChevronRight className={twMerge(clsx("w-4 h-4 text-zinc-400"))} />
          </div>
        )) : (
          <div className={twMerge(clsx("text-center py-8"))}>
            <Activity className={twMerge(clsx("w-12 h-12 text-zinc-600 mx-auto mb-4"))} />
            <p className={twMerge(clsx("text-zinc-400"))}>No recent activity</p>
            <p className={twMerge(clsx("text-zinc-500 text-sm mt-1"))}>
              {isGuest ? 'Sign up to start tracking your activity' : 'Start using our services to see activity here'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
