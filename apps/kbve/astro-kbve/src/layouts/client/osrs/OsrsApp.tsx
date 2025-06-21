import { 
  type CreateOsrsAccountInput,
  type OsrsAccountListEntry,
  type OsrsAccountInfo,
  CreateOsrsAccountInputSchema,
  FORM_FIELD_CONFIG,
  OSRS_ACCOUNT_STATES 
} from 'src/data/schema/osrs/InterfaceOSRS';

import { useState, useEffect } from 'react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { OsrsAccountForm } from './form/OsrsAccountForm';
import { clsx, twMerge } from 'src/utils/tw';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

type ViewMode = 'dashboard' | 'create' | 'edit' | 'details';

interface OsrsAppProps {
  className?: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OsrsApp({ className }: OsrsAppProps) {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [accounts, setAccounts] = useState<OsrsAccountListEntry[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<OsrsAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchAccountInfo = async (accountName: string) => {
    try {
      const { data, error } = await supabase.rpc('get_osrs_account_info', {
        p_account_name: accountName,
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      setAccountInfo(data?.[0] || null);
    } catch (err) {
      console.error('Error fetching account info:', err);
      setAccountInfo(null);
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
        setAccountInfo(null);
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

  useEffect(() => {
    if (selectedAccount) {
      fetchAccountInfo(selectedAccount);
    }
  }, [selectedAccount]);

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

  const renderAccountCard = (account: OsrsAccountListEntry) => {
    const stateConfig = OSRS_ACCOUNT_STATES[account.state];
    
    return (
      <div
        key={account.account_name}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 p-4 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {account.account_name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-lg">{stateConfig.icon}</span>
            <span className={clsx(
              'px-2 py-1 text-xs font-medium rounded-full',
              stateConfig.color === 'green' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
              stateConfig.color === 'red' && 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
              stateConfig.color === 'yellow' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
              stateConfig.color === 'gray' && 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
            )}>
              {stateConfig.label}
            </span>
          </div>
        </div>
        
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="font-medium">{account.p2p ? 'Premium (P2P)' : 'Free (F2P)'}</span>
          </div>
          {account.world && (
            <div className="flex justify-between">
              <span>World:</span>
              <span className="font-medium">{account.world}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Created:</span>
            <span className="font-medium">
              {new Date(account.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => handleViewAccount(account.account_name)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-colors duration-200"
          >
            View Details
          </button>
          <button
            onClick={() => handleEditAccount(account.account_name)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md transition-colors duration-200"
          >
            Edit
          </button>
          <button
            onClick={() => deleteAccount(account.account_name)}
            className="px-3 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 text-sm font-medium rounded-md transition-colors duration-200"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            OSRS Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your Old School RuneScape accounts
          </p>
        </div>
        <button
          onClick={() => setCurrentView('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
        >
          <span>+</span>
          Add Account
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {accounts.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Accounts</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {accounts.filter(a => a.state === 'active').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {accounts.filter(a => a.p2p).length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Premium</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {accounts.filter(a => a.state === 'banned').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Banned</div>
        </div>
      </div>

      {/* Accounts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎮</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No accounts yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Get started by adding your first OSRS account
          </p>
          <button
            onClick={() => setCurrentView('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            Add Your First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map(renderAccountCard)}
        </div>
      )}
    </div>
  );

  const renderAccountDetails = () => {
    if (!selectedAccount || !accountInfo) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading account details...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {selectedAccount}
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Account Information
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {accountInfo.username && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Name
                </label>
                <p className="text-gray-900 dark:text-white">{accountInfo.username}</p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Combat Level
              </label>
              <p className="text-gray-900 dark:text-white">{accountInfo.combat_level}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Total Level
              </label>
              <p className="text-gray-900 dark:text-white">{accountInfo.total_level}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quest Points
              </label>
              <p className="text-gray-900 dark:text-white">{accountInfo.quest_points}</p>
            </div>
          </div>
          
          {accountInfo.notes && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes
              </label>
              <p className="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                {accountInfo.notes}
              </p>
            </div>
          )}
          
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Last synced: {new Date(accountInfo.last_synced_at).toLocaleString()}
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
    <div className={twMerge('w-full max-w-7xl mx-auto p-6', className)}>
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-md">
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {currentView === 'dashboard' && renderDashboard()}
      
      {currentView === 'create' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Add New Account
            </h1>
          </div>
          
          <OsrsAccountForm
            onSuccess={handleAccountCreated}
            onCancel={() => setCurrentView('dashboard')}
            className="max-w-md mx-auto"
          />
        </div>
      )}
      
      {currentView === 'details' && renderAccountDetails()}
      
      {currentView === 'edit' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Edit Account: {selectedAccount}
            </h1>
          </div>
          
          <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-center text-gray-600 dark:text-gray-400">
              Account editing form coming soon...
            </p>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
