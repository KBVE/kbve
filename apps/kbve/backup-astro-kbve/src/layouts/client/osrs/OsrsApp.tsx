import { 
  type CreateOsrsAccountInput,
  type OsrsAccountListEntry,
  CreateOsrsAccountInputSchema,
  FORM_FIELD_CONFIG,
  OSRS_ACCOUNT_STATES 
} from 'src/data/schema/osrs/InterfaceOSRS';

import { useState, useEffect } from 'react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { OsrsAccountForm } from './form/OsrsAccountForm';
import { OsrsAccountDetailForm } from './form/OsrsAccountDetailForm';
import { clsx, twMerge } from 'src/utils/tw';
import { 
  Home, 
  Plus, 
  BarChart3, 
  Settings, 
  Sword, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  Bell,
  User,
  Gamepad2,
  CheckCircle,
  Gem,
  Globe,
  TrendingUp,
  Calendar,
  PieChart,
  AlertTriangle,
  Wrench,
  Download,
  Save,
  Trash2
} from 'lucide-react';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

type ViewMode = 'dashboard' | 'create' | 'edit' | 'details' | 'analytics' | 'settings';

interface OsrsAppProps {
  className?: string;
}

interface NavigationItem {
  id: ViewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OsrsApp({ className }: OsrsAppProps) {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [accounts, setAccounts] = useState<OsrsAccountListEntry[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // =============================================================================
  // NAVIGATION CONFIGURATION
  // =============================================================================

  const navigationItems: NavigationItem[] = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: Home,
      badge: accounts.length > 0 ? accounts.length.toString() : undefined
    },
    { 
      id: 'create', 
      label: 'Add Account', 
      icon: Plus 
    },
    { 
      id: 'analytics', 
      label: 'Analytics', 
      icon: BarChart3 
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      icon: Settings 
    },
  ];

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('list_osrs_accounts');
      
      if (error) {
        throw new Error(error.message);
      }
      
      setAccounts(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load accounts';
      setError(errorMessage);
      console.error('Error fetching accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (accountName: string) => {
    if (!confirm(`Are you sure you want to delete the account "${accountName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('delete_osrs_account', {
        p_account_name: accountName,
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Refresh accounts list
      await fetchAccounts();
      
      // Reset selected account if it was deleted
      if (selectedAccount === accountName) {
        setSelectedAccount(null);
        setCurrentView('dashboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete account';
      setError(errorMessage);
    }
  };

  // =============================================================================
  // EFFECTS
  // =============================================================================

  useEffect(() => {
    fetchAccounts();
  }, []);

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  const handleAccountCreated = (accountName: string) => {
    setCurrentView('dashboard');
    fetchAccounts(); // Refresh the list
  };

  const handleViewAccount = (accountName: string) => {
    setSelectedAccount(accountName);
    setCurrentView('details');
  };

  const handleEditAccount = (accountName: string) => {
    setSelectedAccount(accountName);
    setCurrentView('edit');
  };

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  const renderSidebar = () => (
    <>
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={clsx(
        'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col',
        'lg:relative lg:translate-x-0 min-h-0 h-full',
        mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 w-64' : 'hidden lg:flex',
        !mobileMenuOpen && sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
      )}>
        {/* Sidebar Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            {(!sidebarCollapsed || mobileMenuOpen) && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white">
                  <Sword className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white text-lg">OSRS</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Dashboard</p>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setSidebarCollapsed(!sidebarCollapsed);
                setMobileMenuOpen(false);
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setCurrentView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 hover:scale-105',
                      currentView === item.id
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      <>
                        <span className="font-medium">{item.label}</span>
                        {item.badge && (
                          <span className={clsx(
                            'ml-auto px-2 py-1 text-xs font-bold rounded-full',
                            currentView === item.id
                              ? 'bg-white/20 text-white'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Info */}
        {(!sidebarCollapsed || mobileMenuOpen) && (
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  Player
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  Account Manager
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const renderTopBar = () => (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Mobile Menu Button & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
          >
            <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
              {getCurrentViewTitle()}
            </h1>
            <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
              {getCurrentViewSubtitle()}
            </p>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2 lg:gap-3">
          {currentView === 'dashboard' && (
            <button
              onClick={() => setCurrentView('create')}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2 px-3 lg:py-2 lg:px-4 rounded-lg transition-all duration-300 flex items-center gap-2 hover:scale-105 hover:shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Account</span>
            </button>
          )}
          
          {(currentView === 'details' || currentView === 'edit' || currentView === 'create') && (
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 font-medium flex items-center gap-2 transition-all duration-300 hover:scale-105 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200">
            <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );

  const getCurrentViewTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Account Dashboard';
      case 'create': return 'Add New Account';
      case 'edit': return `Edit ${selectedAccount || 'Account'}`;
      case 'details': return `${selectedAccount || 'Account'} Details`;
      case 'analytics': return 'Analytics & Reports';
      case 'settings': return 'Settings';
      default: return 'OSRS Dashboard';
    }
  };

  const getCurrentViewSubtitle = () => {
    switch (currentView) {
      case 'dashboard': return `Manage your ${accounts.length} OSRS accounts`;
      case 'create': return 'Create a new account entry';
      case 'edit': return 'Modify account information and settings';
      case 'details': return 'View comprehensive account information';
      case 'analytics': return 'Track your progress and statistics';
      case 'settings': return 'Configure your dashboard preferences';
      default: return 'Old School RuneScape account management';
    }
  };

  const renderAccountCard = (account: OsrsAccountListEntry) => {
    const stateConfig = OSRS_ACCOUNT_STATES[account.state];
    
    return (
      <div
        key={account.account_name}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 p-6 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {account.account_name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-2xl transition-transform duration-300 hover:scale-110">{stateConfig.icon}</span>
            <span className={clsx(
              'px-3 py-1 text-xs font-bold rounded-full transition-all duration-300 hover:scale-105',
              stateConfig.color === 'green' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
              stateConfig.color === 'red' && 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
              stateConfig.color === 'yellow' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
              stateConfig.color === 'gray' && 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
            )}>
              {stateConfig.label}
            </span>
          </div>
        </div>
        
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 mb-6">
          <div className="flex justify-between items-center">
            <span>Type:</span>
            <span className={clsx(
              'font-bold px-2 py-1 rounded-full text-xs',
              account.p2p 
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            )}>
              {account.p2p ? 'Premium (P2P)' : 'Free (F2P)'}
            </span>
          </div>
          {account.world && (
            <div className="flex justify-between items-center">
              <span>World:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">#{account.world}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span>Created:</span>
            <span className="font-medium">
              {new Date(account.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => handleViewAccount(account.account_name)}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-lg"
          >
            View Details
          </button>
          <button
            onClick={() => handleEditAccount(account.account_name)}
            className="px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-lg transition-all duration-300 hover:scale-105"
          >
            ✏️
          </button>
          <button
            onClick={() => deleteAccount(account.account_name)}
            className="px-4 py-3 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 text-sm font-bold rounded-lg transition-all duration-300 hover:scale-105"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-4 lg:space-y-6 p-4 lg:p-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-700 p-4 lg:p-6 rounded-xl shadow-lg border border-blue-200 dark:border-gray-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <div className="text-2xl lg:text-3xl font-bold text-blue-600 dark:text-blue-400">
              {accounts.length}
            </div>
            <div className="text-blue-600 dark:text-blue-400">
              <Gamepad2 className="w-8 h-8 lg:w-10 lg:h-10" />
            </div>
          </div>
          <div className="text-xs lg:text-sm font-medium text-blue-800 dark:text-blue-300">Total Accounts</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 hidden sm:block">
            {accounts.length > 0 ? '+100% active' : 'Start your journey'}
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-800 dark:to-gray-700 p-4 lg:p-6 rounded-xl shadow-lg border border-green-200 dark:border-gray-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <div className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">
              {accounts.filter(a => a.state === 'active').length}
            </div>
            <div className="text-green-600 dark:text-green-400">
              <CheckCircle className="w-8 h-8 lg:w-10 lg:h-10" />
            </div>
          </div>
          <div className="text-xs lg:text-sm font-medium text-green-800 dark:text-green-300">Active</div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1 hidden sm:block">
            Ready to play
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-gray-800 dark:to-gray-700 p-4 lg:p-6 rounded-xl shadow-lg border border-purple-200 dark:border-gray-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <div className="text-2xl lg:text-3xl font-bold text-purple-600 dark:text-purple-400">
              {accounts.filter(a => a.p2p).length}
            </div>
            <div className="text-purple-600 dark:text-purple-400">
              <Gem className="w-8 h-8 lg:w-10 lg:h-10" />
            </div>
          </div>
          <div className="text-xs lg:text-sm font-medium text-purple-800 dark:text-purple-300">Premium</div>
          <div className="text-xs text-purple-600 dark:text-purple-400 mt-1 hidden sm:block">
            Membership active
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-50 to-red-100 dark:from-gray-800 dark:to-gray-700 p-4 lg:p-6 rounded-xl shadow-lg border border-orange-200 dark:border-gray-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <div className="text-2xl lg:text-3xl font-bold text-orange-600 dark:text-orange-400">
              {accounts.reduce((total, acc) => acc.world ? total + 1 : total, 0)}
            </div>
            <div className="text-orange-600 dark:text-orange-400">
              <Globe className="w-8 h-8 lg:w-10 lg:h-10" />
            </div>
          </div>
          <div className="text-xs lg:text-sm font-medium text-orange-800 dark:text-orange-300">In Game</div>
          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1 hidden sm:block">
            Currently online
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setCurrentView('create')}
            className="p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-600 rounded-lg border border-blue-200 dark:border-gray-600 hover:shadow-md transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="text-blue-600 dark:text-blue-400 mb-2">
              <Plus className="w-8 h-8" />
            </div>
            <div className="font-medium text-gray-900 dark:text-white">Add Account</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Create new OSRS account entry</div>
          </button>
          
          <button
            onClick={() => setCurrentView('analytics')}
            className="p-4 bg-gradient-to-br from-purple-50 to-violet-100 dark:from-gray-700 dark:to-gray-600 rounded-lg border border-purple-200 dark:border-gray-600 hover:shadow-md transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="text-purple-600 dark:text-purple-400 mb-2">
              <BarChart3 className="w-8 h-8" />
            </div>
            <div className="font-medium text-gray-900 dark:text-white">View Analytics</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Track your progress</div>
          </button>
          
          <button
            onClick={() => setCurrentView('settings')}
            className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all duration-300 hover:-translate-y-1 text-left sm:col-span-2 lg:col-span-1"
          >
            <div className="text-gray-600 dark:text-gray-400 mb-2">
              <Settings className="w-8 h-8" />
            </div>
            <div className="font-medium text-gray-900 dark:text-white">Settings</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Customize your dashboard</div>
          </button>
        </div>
      </div>

      {/* Accounts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 lg:py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading your accounts...</p>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 lg:py-20">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-8 lg:p-12 max-w-md mx-auto shadow-lg border border-indigo-200 dark:border-gray-600">
            <div className="text-indigo-600 dark:text-indigo-400 mb-4 lg:mb-6 flex justify-center">
              <Gamepad2 className="w-16 h-16 lg:w-20 lg:h-20" />
            </div>
            <h3 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mb-3">
              No accounts yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-base lg:text-lg">
              Get started by adding your first OSRS account
            </p>
            <button
              onClick={() => setCurrentView('create')}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-3 px-6 lg:px-8 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg"
            >
              Add Your First Account
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">Your Accounts</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
            {accounts.map(renderAccountCard)}
          </div>
        </div>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-4 lg:space-y-6 p-4 lg:p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        {/* Account Status Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Account Status</h3>
          <div className="space-y-3">
            {Object.entries(OSRS_ACCOUNT_STATES).map(([state, config]) => {
              const count = accounts.filter(a => a.state === state).length;
              const percentage = accounts.length > 0 ? (count / accounts.length) * 100 : 0;
              
              return (
                <div key={state} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{config.icon}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-sm lg:text-base">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 lg:w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={clsx(
                          'h-2 rounded-full transition-all duration-500',
                          config.color === 'green' && 'bg-green-500',
                          config.color === 'red' && 'bg-red-500',
                          config.color === 'yellow' && 'bg-yellow-500',
                          config.color === 'gray' && 'bg-gray-500'
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-400 w-6 lg:w-8 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {accounts.slice(0, 5).map((account, index) => (
              <div key={account.account_name} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {account.account_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{account.account_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(account.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {OSRS_ACCOUNT_STATES[account.state].icon}
                </span>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No accounts to show
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Additional Analytics */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Account Overview</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <div className="text-center">
            <div className="text-xl lg:text-2xl font-bold text-blue-600 dark:text-blue-400">
              {accounts.filter(a => a.p2p).length}/{accounts.length}
            </div>
            <div className="text-xs lg:text-sm text-gray-600 dark:text-gray-400">Premium Accounts</div>
          </div>
          <div className="text-center">
            <div className="text-xl lg:text-2xl font-bold text-green-600 dark:text-green-400">
              {accounts.filter(a => a.world).length}
            </div>
            <div className="text-xs lg:text-sm text-gray-600 dark:text-gray-400">Active Worlds</div>
          </div>
          <div className="text-center">
            <div className="text-xl lg:text-2xl font-bold text-purple-600 dark:text-purple-400">
              {accounts.length > 0 ? Math.round(accounts.filter(a => a.state === 'active').length / accounts.length * 100) : 0}%
            </div>
            <div className="text-xs lg:text-sm text-gray-600 dark:text-gray-400">Active Rate</div>
          </div>
          <div className="text-center">
            <div className="text-xl lg:text-2xl font-bold text-orange-600 dark:text-orange-400">
              {accounts.length > 0 ? Math.ceil((Date.now() - new Date(accounts[0]?.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)) : 0}
            </div>
            <div className="text-xs lg:text-sm text-gray-600 dark:text-gray-400">Days Since First</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-4 lg:space-y-6 p-4 lg:p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">General Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="font-medium text-gray-900 dark:text-white text-sm lg:text-base">Auto-refresh accounts</p>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">Automatically refresh account data</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full flex items-center justify-end px-1 flex-shrink-0">
                <div className="w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="font-medium text-gray-900 dark:text-white text-sm lg:text-base">Compact view</p>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">Show more accounts per row</p>
              </div>
              <div className="w-12 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center px-1 flex-shrink-0">
                <div className="w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="font-medium text-gray-900 dark:text-white text-sm lg:text-base">Show tooltips</p>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">Display helpful tooltips</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full flex items-center justify-end px-1 flex-shrink-0">
                <div className="w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Data Management</h3>
          <div className="space-y-4">
            <button className="w-full p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200">
              <div className="font-medium text-blue-900 dark:text-blue-300 text-sm lg:text-base">Export Data</div>
              <div className="text-xs lg:text-sm text-blue-700 dark:text-blue-400">Download your account data</div>
            </button>
            
            <button className="w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-left hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors duration-200">
              <div className="font-medium text-green-900 dark:text-green-300 text-sm lg:text-base">Backup Settings</div>
              <div className="text-xs lg:text-sm text-green-700 dark:text-green-400">Save your configuration</div>
            </button>
            
            <button className="w-full p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-left hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors duration-200">
              <div className="font-medium text-red-900 dark:text-red-300 text-sm lg:text-base">Clear Cache</div>
              <div className="text-xs lg:text-sm text-red-700 dark:text-red-400">Reset stored data</div>
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">About</h3>
        <div className="text-center py-6">
          <div className="text-orange-600 dark:text-orange-400 mb-4 flex justify-center">
            <Sword className="w-12 h-12 lg:w-16 lg:h-16" />
          </div>
          <h4 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white mb-2">OSRS Dashboard</h4>
          <p className="text-sm lg:text-base text-gray-600 dark:text-gray-400 mb-4">
            A modern interface for managing your Old School RuneScape accounts
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-6 text-xs lg:text-sm text-gray-500 dark:text-gray-400">
            <span>Version 2.0.0</span>
            <span className="hidden sm:inline">•</span>
            <span>Built with React & Tailwind</span>
            <span className="hidden sm:inline">•</span>
            <span>Powered by Supabase</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccountDetails = () => {
    if (!selectedAccount) {
      return (
        <div className="text-center py-12 p-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12">
            <div className="text-blue-600 dark:text-blue-400 mb-4 flex justify-center">
              <User className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Account Selected</h3>
            <p className="text-gray-600 dark:text-gray-400">Please select an account from the dashboard</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6">
        <OsrsAccountDetailForm
          accountName={selectedAccount}
          onSuccess={() => {
            fetchAccounts();
          }}
          onCancel={() => setCurrentView('dashboard')}
        />
      </div>
    );
  };

  const renderCreateAccount = () => (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 lg:p-6 text-white">
          <h2 className="text-xl lg:text-2xl font-bold mb-2">Add New OSRS Account</h2>
          <p className="text-blue-100">Create a new account entry in your dashboard</p>
        </div>
        
        <div className="p-4 lg:p-6">
          <OsrsAccountForm
            onSuccess={handleAccountCreated}
            onCancel={() => setCurrentView('dashboard')}
          />
        </div>
      </div>
    </div>
  );

  const renderEditAccount = () => {
    if (!selectedAccount) {
      return (
        <div className="text-center py-12 p-4 lg:p-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 lg:p-12 max-w-md mx-auto">
            <div className="text-orange-600 dark:text-orange-400 mb-4 flex justify-center">
              <AlertTriangle className="w-12 h-12 lg:w-16 lg:h-16" />
            </div>
            <h3 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white mb-2">No Account Selected</h3>
            <p className="text-gray-600 dark:text-gray-400">Please select an account to edit</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 lg:p-6 text-white">
            <h2 className="text-xl lg:text-2xl font-bold mb-2">Edit Account: {selectedAccount}</h2>
            <p className="text-purple-100">Update account information and settings</p>
          </div>
          
          <div className="p-4 lg:p-6">
            <div className="text-center py-8 lg:py-12">
              <div className="text-purple-600 dark:text-purple-400 mb-4 flex justify-center">
                <Wrench className="w-12 h-12 lg:w-16 lg:h-16" />
              </div>
              <h3 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white mb-2">
                Coming Soon
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Account editing features are currently in development
              </p>
              <button
                onClick={() => setCurrentView('dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className={twMerge('w-full h-full max-h-[calc(100vh-2rem)] flex bg-gray-50 dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden relative', className)}>
      {/* Error Display */}
      {error && (
        <div className="absolute top-4 right-4 z-50 max-w-sm p-4 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <div className="text-red-600 dark:text-red-400 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-red-800 dark:text-red-200 font-medium text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors duration-200 text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      {renderSidebar()}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Bar */}
        {renderTopBar()}

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {currentView === 'dashboard' && renderDashboard()}
          {currentView === 'create' && renderCreateAccount()}
          {currentView === 'details' && renderAccountDetails()}
          {currentView === 'edit' && renderEditAccount()}
          {currentView === 'analytics' && renderAnalytics()}
          {currentView === 'settings' && renderSettings()}
        </main>
      </div>
    </div>
  );
}
