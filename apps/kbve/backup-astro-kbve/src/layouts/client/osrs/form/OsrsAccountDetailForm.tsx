import { 
  type UpdateOsrsAccountInfoInput,
  UpdateOsrsAccountInfoInputSchema,
  FORM_FIELD_CONFIG,
  OSRS_ACCOUNT_STATES,
  type OsrsAccountInfo
} from 'src/data/schema/osrs/InterfaceOSRS';

import { useForm } from 'react-hook-form';
import { clsx, twMerge } from 'src/utils/tw';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface OsrsAccountDetailFormProps {
  accountName: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OsrsAccountDetailForm({ 
  accountName, 
  onSuccess, 
  onCancel, 
  className 
}: OsrsAccountDetailFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<OsrsAccountInfo | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty },
    reset,
    setValue,
  } = useForm<UpdateOsrsAccountInfoInput>({
    resolver: zodResolver(UpdateOsrsAccountInfoInputSchema),
    mode: 'onChange',
    defaultValues: {
      account_name: accountName,
      username: '',
      combat_level: undefined,
      total_level: undefined,
      quest_points: undefined,
      notes: '',
    },
  });

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  const fetchAccountInfo = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_osrs_account_info', {
        p_account_name: accountName,
      });

      if (error) {
        throw new Error(error.message);
      }

      const info = data?.[0] || null;
      setAccountInfo(info);

      // Populate form with existing data
      if (info) {
        setValue('username', info.username || '');
        setValue('combat_level', info.combat_level !== null && info.combat_level !== undefined ? info.combat_level : undefined);
        setValue('total_level', info.total_level !== null && info.total_level !== undefined ? info.total_level : undefined);
        setValue('quest_points', info.quest_points !== null && info.quest_points !== undefined ? info.quest_points : undefined);
        setValue('wealth_gp', info.wealth_gp !== null && info.wealth_gp !== undefined ? info.wealth_gp : undefined);
        setValue('notes', info.notes || '');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load account info';
      setSubmitError(errorMessage);
      console.error('Error fetching account info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountInfo();
  }, [accountName]);

  // =============================================================================
  // FORM SUBMISSION
  // =============================================================================

  const onSubmit = async (data: UpdateOsrsAccountInfoInput) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const { error } = await supabase.rpc('update_osrs_account_info', {
        p_account_name: data.account_name,
        p_username: data.username || null,
        p_notes: data.notes || null,
        p_combat_level: data.combat_level !== undefined ? data.combat_level : null,
        p_total_level: data.total_level !== undefined ? data.total_level : null,
        p_quest_points: data.quest_points !== undefined ? data.quest_points : null,
        p_wealth_gp: data.wealth_gp !== undefined ? data.wealth_gp : null,
      });

      if (error) {
        throw new Error(error.message || 'Failed to update account info');
      }

      setSubmitSuccess('Account information updated successfully!');
      
      // Refresh the account info
      await fetchAccountInfo();
      
      // Call success callback if provided
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
    setSubmitError(null);
    setSubmitSuccess(null);
    onCancel?.();
  };

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  const renderStatsSection = () => {
    if (!accountInfo) return null;

    return (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Current Stats
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {accountInfo.combat_level !== null && accountInfo.combat_level !== undefined ? accountInfo.combat_level : 'N/A'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Combat Level</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {accountInfo.total_level !== null && accountInfo.total_level !== undefined ? accountInfo.total_level : 'N/A'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Level</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {accountInfo.quest_points !== null && accountInfo.quest_points !== undefined ? accountInfo.quest_points : 'N/A'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Quest Points</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {accountInfo.wealth_gp !== null && accountInfo.wealth_gp !== undefined ? accountInfo.wealth_gp.toLocaleString() : 'N/A'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Wealth (GP)</div>
          </div>
        </div>
        {accountInfo.last_synced_at && (
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
            Last synced: {new Date(accountInfo.last_synced_at).toLocaleString()}
          </div>
        )}
      </div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  if (isLoading) {
    return (
      <div className={twMerge('w-full max-w-2xl mx-auto', className)}>
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading account details...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={twMerge('w-full max-w-2xl mx-auto', className)}>
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Account Details: {accountName}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            View and update your OSRS account information
          </p>
        </div>

        {renderStatsSection()}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username Field */}
          <div>
            <label 
              htmlFor="username" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {FORM_FIELD_CONFIG.username.label}
            </label>
            <input
              {...register('username')}
              type="text"
              id="username"
              placeholder={FORM_FIELD_CONFIG.username.placeholder}
              maxLength={FORM_FIELD_CONFIG.username.maxLength}
              className={clsx(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                errors.username 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
              )}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.username.message}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional display name for your account
            </p>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Combat Level */}
            <div>
              <label 
                htmlFor="combat_level" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {FORM_FIELD_CONFIG.combat_level.label}
              </label>
              <input
                {...register('combat_level', { 
                  setValueAs: (value) => value === '' ? undefined : Number(value) 
                })}
                type="number"
                id="combat_level"
                placeholder={FORM_FIELD_CONFIG.combat_level.placeholder}
                min={FORM_FIELD_CONFIG.combat_level.min}
                max={FORM_FIELD_CONFIG.combat_level.max}
                className={clsx(
                  'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                  errors.combat_level 
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                    : 'border-gray-300'
                )}
              />
              {errors.combat_level && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.combat_level.message}
                </p>
              )}
            </div>

            {/* Total Level */}
            <div>
              <label 
                htmlFor="total_level" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {FORM_FIELD_CONFIG.total_level.label}
              </label>
              <input
                {...register('total_level', { 
                  setValueAs: (value) => value === '' ? undefined : Number(value) 
                })}
                type="number"
                id="total_level"
                placeholder={FORM_FIELD_CONFIG.total_level.placeholder}
                min={FORM_FIELD_CONFIG.total_level.min}
                max={FORM_FIELD_CONFIG.total_level.max}
                className={clsx(
                  'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                  errors.total_level 
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                    : 'border-gray-300'
                )}
              />
              {errors.total_level && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.total_level.message}
                </p>
              )}
            </div>

            {/* Quest Points */}
            <div>
              <label 
                htmlFor="quest_points" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {FORM_FIELD_CONFIG.quest_points.label}
              </label>
              <input
                {...register('quest_points', { 
                  setValueAs: (value) => value === '' ? undefined : Number(value) 
                })}
                type="number"
                id="quest_points"
                placeholder={FORM_FIELD_CONFIG.quest_points.placeholder}
                min={FORM_FIELD_CONFIG.quest_points.min}
                max={FORM_FIELD_CONFIG.quest_points.max}
                className={clsx(
                  'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                  errors.quest_points 
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                    : 'border-gray-300'
                )}
              />
              {errors.quest_points && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.quest_points.message}
                </p>
              )}
            </div>

            {/* Wealth GP */}
            <div>
              <label 
                htmlFor="wealth_gp" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {FORM_FIELD_CONFIG.wealth_gp.label}
              </label>
              <input
                {...register('wealth_gp', { 
                  setValueAs: (value) => value === '' ? undefined : Number(value) 
                })}
                type="number"
                id="wealth_gp"
                placeholder={FORM_FIELD_CONFIG.wealth_gp.placeholder}
                min={FORM_FIELD_CONFIG.wealth_gp.min}
                className={clsx(
                  'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                  errors.wealth_gp 
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                    : 'border-gray-300'
                )}
              />
              {errors.wealth_gp && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.wealth_gp.message}
                </p>
              )}
            </div>
          </div>

          {/* Notes Field */}
          <div>
            <label 
              htmlFor="notes" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {FORM_FIELD_CONFIG.notes.label}
            </label>
            <textarea
              {...register('notes')}
              id="notes"
              rows={FORM_FIELD_CONFIG.notes.rows}
              placeholder={FORM_FIELD_CONFIG.notes.placeholder}
              maxLength={FORM_FIELD_CONFIG.notes.maxLength}
              className={clsx(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                errors.notes 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
              )}
            />
            {errors.notes && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.notes.message}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Add personal notes about this account (goals, strategies, etc.)
            </p>
          </div>

          {/* Success Message */}
          {submitSuccess && (
            <div className="p-3 bg-green-100 border border-green-300 rounded-md">
              <p className="text-sm text-green-700">{submitSuccess}</p>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-md">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className={clsx(
                'flex-1 py-2 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2',
                'transition-colors duration-200',
                isDirty && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </span>
              ) : !isDirty ? (
                'No Changes'
              ) : (
                'Update Account Info'
              )}
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
