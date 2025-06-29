import { clsx, twMerge } from 'src/utils/tw';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { userBalanceAtom, syncUserBalance, userIdAtom, syncSupabaseUser, userAtom } from 'src/layouts/client/supabase/profile/userstate';
import { useState, useEffect } from 'react';
import { 
  Wallet, 
  User, 
  Clock, 
  Award, 
  Activity, 
  TrendingUp, 
  CreditCard, 
  Gift,
  Bell, 
  Settings, 
  Plus, 
  ChevronRight,
  Star,
  Calendar,
  Target
} from 'lucide-react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

interface UserStats {
  creditBalance: number;
  accountAge: string;
  activityLevel: 'Low' | 'Medium' | 'High';
  membershipTier: 'Guest' | 'Basic' | 'Premium' | 'VIP';
}

interface UserActivityItem {
  id: string;
  type: 'credit' | 'profile' | 'achievement' | 'login';
  message: string;
  timestamp: Date;
  status?: 'success' | 'info' | 'warning';
}

const DashboardHome = () => {
  // User state from atoms
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const userBalance = useStore(userBalanceAtom);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [activities, setActivities] = useState<UserActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync user data when component mounts
  useEffect(() => {
    syncSupabaseUser();
    if (userId) {
      syncUserBalance(userId);
    }
  }, [userId]);

  useEffect(() => {
    const fetchUserDashboardData = async () => {
      try {
        // Simulate light API call - keep it minimal for user-facing dashboard
        await new Promise(resolve => setTimeout(resolve, 800)); // Shorter loading time
        
        // Guest mode vs logged in user
        const isGuest = !user || !userId;
        const username = isGuest ? 'Guest' : (user.email?.split('@')[0] || 'User');
        
        // Handle user balance - extract credits value if it's an object
        let creditBalance = 0;
        if (!isGuest && userBalance) {
          creditBalance = typeof userBalance === 'object' && 'credits' in userBalance 
            ? (userBalance as any).credits 
            : typeof userBalance === 'number' 
            ? userBalance 
            : 0;
        }
        
        // Calculate account age for logged in users
        let accountAge = 'New User';
        if (!isGuest && user.created_at) {
          const createdDate = new Date(user.created_at);
          const daysSince = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSince < 7) accountAge = 'New User';
          else if (daysSince < 30) accountAge = `${daysSince} days`;
          else if (daysSince < 365) accountAge = `${Math.floor(daysSince / 30)} months`;
          else accountAge = `${Math.floor(daysSince / 365)} years`;
        }

        // Determine membership tier based on credit balance
        let membershipTier: UserStats['membershipTier'] = 'Guest';
        if (!isGuest) {
          if (creditBalance >= 1000) membershipTier = 'VIP';
          else if (creditBalance >= 500) membershipTier = 'Premium';
          else membershipTier = 'Basic';
        }

        // Determine activity level (could be based on actual user data in the future)
        const activityLevel: UserStats['activityLevel'] = isGuest ? 'Low' : 'Medium';

        setStats({
          creditBalance,
          accountAge,
          activityLevel,
          membershipTier
        });

        // Generate user-specific activities
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
          }
        ];

        setActivities(userActivities);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user dashboard data:', error);
        setLoading(false);
      }
    };

    fetchUserDashboardData();
  }, [user, userId, userBalance]);

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'credit': return <Wallet className="w-4 h-4" />;
      case 'profile': return <User className="w-4 h-4" />;
      case 'achievement': return <Award className="w-4 h-4" />;
      case 'login': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'VIP': return 'text-purple-400';
      case 'Premium': return 'text-yellow-400';
      case 'Basic': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'VIP': return 'bg-purple-500/10 border-purple-500/20';
      case 'Premium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'Basic': return 'bg-green-500/10 border-green-500/20';
      default: return 'bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const isGuest = !user || !userId;
  const username = isGuest ? 'Guest' : (user?.email?.split('@')[0] || 'User');

  if (loading) {
    return null; // Skeleton is handled by Astro component
  }

  return (
    <div className="mt-8 space-y-8">
      {/* User-focused Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Credit Balance Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm font-medium">Credit Balance</p>
              <p className="text-2xl font-bold text-white mt-1">{stats?.creditBalance.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Wallet className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm">
              {isGuest ? (
                <span className="text-zinc-400">Sign up to earn credits</span>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 text-green-400 mr-1" />
                  <span className="text-green-400">Active account</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Membership Tier Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm font-medium">Membership</p>
              <p className="text-2xl font-bold text-white mt-1">{stats?.membershipTier}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Star className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div className="mt-4">
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${getTierBadge(stats?.membershipTier || 'Guest')}`}>
              <span className={getTierColor(stats?.membershipTier || 'Guest')}>
                {stats?.membershipTier || 'Guest'} Tier
              </span>
            </div>
          </div>
        </div>

        {/* Account Age Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm font-medium">Member Since</p>
              <p className="text-2xl font-bold text-white mt-1">{stats?.accountAge}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Calendar className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm">
              {isGuest ? (
                <span className="text-zinc-400">Join our community</span>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-blue-400 mr-1" />
                  <span className="text-blue-400">Trusted member</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Activity Level Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm font-medium">Activity Level</p>
              <p className="text-2xl font-bold text-white mt-1">{stats?.activityLevel}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <TrendingUp className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-zinc-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-1000 ${
                  stats?.activityLevel === 'High' ? 'bg-green-400' :
                  stats?.activityLevel === 'Medium' ? 'bg-yellow-400' :
                  'bg-red-400'
                }`}
                style={{ 
                  width: stats?.activityLevel === 'High' ? '90%' : 
                         stats?.activityLevel === 'Medium' ? '60%' : '30%' 
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* User Activity and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* Personal Activity Feed */}
          <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Recent Activity</h3>
              {!isGuest && (
                <button className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors">
                  View All
                </button>
              )}
            </div>
            <div className="space-y-4">
              {activities.length > 0 ? activities.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-zinc-700/50 transition-colors">
                  <div className={`p-2 rounded-lg ${
                    activity.status === 'success' ? 'bg-green-500/10 text-green-400' :
                    activity.status === 'info' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{activity.message}</p>
                    <p className="text-zinc-400 text-xs mt-1">{formatTimeAgo(activity.timestamp)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </div>
              )) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400">No recent activity</p>
                  <p className="text-zinc-500 text-sm mt-1">
                    {isGuest ? 'Sign up to start tracking your activity' : 'Start using our services to see activity here'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              {[
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
              ].map((action, index) => (
                <button
                  key={index}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-zinc-700 transition-colors text-left"
                >
                  <span className={action.color}>{action.icon}</span>
                  <span className="text-white">{action.label}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 ml-auto" />
                </button>
              ))}
            </div>
          </div>

          {/* Welcome Message / User Info */}
          <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Welcome{!isGuest && `, ${username}`}!
            </h3>
            <div className="space-y-3">
              {isGuest ? (
                <>
                  <p className="text-zinc-300 text-sm">
                    Join our community to unlock all features and start earning credits.
                  </p>
                  <button className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors">
                    Get Started
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-sm">Account Status</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-green-400 text-sm">Active</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-sm">Total Credits</span>
                    <span className="text-cyan-400 text-sm font-medium">
                      {stats?.creditBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-sm">Member Tier</span>
                    <span className={`text-sm font-medium ${getTierColor(stats?.membershipTier || 'Guest')}`}>
                      {stats?.membershipTier}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;