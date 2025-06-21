import { 
  type CreateOsrsAccountInput,
  CreateOsrsAccountInputSchema,
  FORM_FIELD_CONFIG,
  OSRS_ACCOUNT_STATES,
  generateSecretKeys,
  validateSecretKey
} from 'src/data/schema/osrs/InterfaceOSRS';

import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { clsx, twMerge } from 'src/utils/tw';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { task } from 'nanostores';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';

// =============================================================================
// STORES & TASKS
// =============================================================================

// Function for creating an OSRS account with proper secret management
const createAccountTask = async ({ account_name, email, password, world, p2p }: CreateOsrsAccountInput) => {
  // Step 1: Generate safe secret keys
  const { emailKey, passwordKey, isValid } = generateSecretKeys(account_name, email);
  
  if (!isValid) {
    throw new Error('Failed to generate valid secret keys. Please try a shorter account name or email.');
  }

  try {
    // Step 2: Store email secret
    const { error: emailError } = await supabase.rpc('set_user_secret', {
      p_key: emailKey,
      p_value: email,
    });

    if (emailError) {
      throw new Error(`Failed to store email secret: ${emailError.message}`);
    }

    // Step 3: Store password secret
    const { error: passwordError } = await supabase.rpc('set_user_secret', {
      p_key: passwordKey,
      p_value: password,
    });

    if (passwordError) {
      throw new Error(`Failed to store password secret: ${passwordError.message}`);
    }

    // Step 4: Create OSRS account with secret key references
    const { data, error } = await supabase.rpc('create_osrs_account', {
      p_account_name: account_name,
      p_email: emailKey,    // Pass the secret key, not the raw email
      p_password: passwordKey, // Pass the secret key, not the raw password
      p_world: world || null,
      p_p2p: p2p || false,
    });

    if (error) {
      throw new Error(error.message || 'Failed to create OSRS account');
    }

    return data;
  } catch (error) {
    // If account creation fails, we should ideally clean up the secrets
    // but for now, we'll let them remain (they can be reused or cleaned up later)
    throw error;
  }
};

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

interface OsrsAccountFormProps {
  onSuccess?: (accountName: string) => void;
  onCancel?: () => void;
  className?: string;
}

// =============================================================================
// FORM COMPONENT
// =============================================================================

export function OsrsAccountForm({ onSuccess, onCancel, className }: OsrsAccountFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, dirtyFields },
    reset,
    watch,
  } = useForm<CreateOsrsAccountInput>({
    resolver: zodResolver(CreateOsrsAccountInputSchema),
    mode: 'onChange',
    defaultValues: {
      account_name: '',
      email: '',
      password: '',
      world: undefined,
      p2p: false,
    },
  });

  // Watch form values for key generation preview
  const accountName = watch('account_name');
  const email = watch('email');
  const isPremium = watch('p2p');

  // Generate preview of secret keys
  const keyPreview = accountName && email ? generateSecretKeys(accountName, email) : null;

  const onSubmit = async (data: CreateOsrsAccountInput) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      await createAccountTask(data);
      setSubmitSuccess(`Account "${data.account_name}" created successfully!`);
      
      // Reset form after successful submission
      reset();
      
      // Call success callback if provided
      onSuccess?.(data.account_name);
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

  return (
    <div className={twMerge('w-full max-w-md mx-auto', className)}>
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Create OSRS Account
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Add a new Old School RuneScape account to your dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Account Name Field */}
          <div>
            <label 
              htmlFor="account_name" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {FORM_FIELD_CONFIG.account_name.label}
            </label>
            <input
              {...register('account_name')}
              type="text"
              id="account_name"
              placeholder={FORM_FIELD_CONFIG.account_name.placeholder}
              maxLength={FORM_FIELD_CONFIG.account_name.maxLength}
              className={clsx(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                errors.account_name 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
              )}
            />
            {errors.account_name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.account_name.message}
              </p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {FORM_FIELD_CONFIG.email.label}
            </label>
            <input
              {...register('email')}
              type="email"
              id="email"
              placeholder={FORM_FIELD_CONFIG.email.placeholder}
              className={clsx(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                errors.email 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
              )}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {FORM_FIELD_CONFIG.password.label}
            </label>
            <input
              {...register('password')}
              type="password"
              id="password"
              placeholder={FORM_FIELD_CONFIG.password.placeholder}
              minLength={FORM_FIELD_CONFIG.password.minLength}
              maxLength={FORM_FIELD_CONFIG.password.maxLength}
              className={clsx(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                errors.password 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
              )}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* P2P Checkbox */}
          <div className="flex items-center">
            <input
              {...register('p2p')}
              type="checkbox"
              id="p2p"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700"
            />
            <label 
              htmlFor="p2p" 
              className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
            >
              Premium (P2P) Account
            </label>
          </div>

          {/* World Field - Show only if P2P is selected */}
          {isPremium && (
            <div>
              <label 
                htmlFor="world" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {FORM_FIELD_CONFIG.world.label}
              </label>
              <input
                {...register('world', { 
                  setValueAs: (value) => value === '' ? undefined : Number(value) 
                })}
                type="number"
                id="world"
                placeholder={FORM_FIELD_CONFIG.world.placeholder}
                min={FORM_FIELD_CONFIG.world.min}
                max={FORM_FIELD_CONFIG.world.max}
                className={clsx(
                  'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400',
                  errors.world 
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                    : 'border-gray-300'
                )}
              />
              {errors.world && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.world.message}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                P2P worlds: 300-599 | F2P worlds: 1-99
              </p>
            </div>
          )}

          {/* Secret Key Preview */}
          {keyPreview && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                🔐 Secret Keys Preview
              </h4>
              <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <div>
                  <span className="font-medium">Email Key:</span> 
                  <code className="ml-1 bg-blue-100 dark:bg-blue-800 px-1 rounded">
                    {keyPreview.emailKey}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Password Key:</span> 
                  <code className="ml-1 bg-blue-100 dark:bg-blue-800 px-1 rounded">
                    {keyPreview.passwordKey}
                  </code>
                </div>
                {!keyPreview.isValid && (
                  <div className="text-red-600 dark:text-red-400 font-medium mt-2">
                    ⚠️ Keys are too long. Please use a shorter account name or email.
                  </div>
                )}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                These keys will be automatically generated to securely store your credentials.
              </p>
            </div>
          )}

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
              disabled={!isValid || isSubmitting || (keyPreview ? !keyPreview.isValid : false)}
              className={clsx(
                'flex-1 py-2 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2',
                'transition-colors duration-200',
                isValid && !isSubmitting && (!keyPreview || keyPreview.isValid)
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
                  Creating...
                </span>
              ) : keyPreview && !keyPreview.isValid ? (
                'Invalid Key Length'
              ) : (
                'Create Account'
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
