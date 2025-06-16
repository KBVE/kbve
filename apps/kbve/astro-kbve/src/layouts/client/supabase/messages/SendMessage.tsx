import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
//import { transferSchema, transferBalance, type TransferInput } from './transferBalance';
import { useStore } from '@nanostores/react';
import { userBalanceAtom, userIdAtom, getUuidByUsername, getUsernameByUuid } from 'src/layouts/client/supabase/profile/userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { clsx, twMerge } from 'src/utils/tw';
import { z } from 'zod';

type SendMessageInput = {
  receiver: string;
  title: string;
  description?: string;
  message: string;
};

type SendMessageResult = {
  success: boolean;
  data?: any;
  error?: string;
};

// Helper to send a message via Supabase RPC
export async function sendMessage({
  receiver,
  title,
  description,
  message
}: SendMessageInput): Promise<SendMessageResult> {
  if (!receiver || !title || !message) {
    return { success: false, error: 'Receiver, title, and message are required.' };
  }

  const { data, error } = await supabase.rpc('proxy_send_user_message', {
    p_receiver: receiver,
    p_title: title,
    p_description: description,
    p_message: message
  });

  if (error) {
    console.error('[sendMessage] RPC Error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// Regex for disallowed content (matches HTML tags, onerror/onload, control chars, and certain unicode)
const disallowedPattern = /<[^>]*>|(onerror|onload)\s*=|[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029]/i;

const sendMessageSchema = z.object({
  receiver: z.string().min(3, 'Receiver is required'),
  title: z.string()
    .min(1, 'Title is required')
    .max(100, 'Title must be at most 100 characters')
    .refine(val => !disallowedPattern.test(val), {
      message: 'Title contains disallowed content.'
    }),
  description: z.string()
    .max(300, 'Description must be at most 300 characters')
    .refine(val => !disallowedPattern.test(val), {
      message: 'Description contains disallowed content.'
    })
    .optional()
    .or(z.literal('')),
  message: z.string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be at most 5000 characters')
    .refine(val => !disallowedPattern.test(val), {
      message: 'Message contains disallowed content.'
    }),
});

type SendMessageForm = z.infer<typeof sendMessageSchema>;

export const SendMessage: React.FC = () => {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting }, reset } = useForm<SendMessageForm>({
    resolver: zodResolver(sendMessageSchema),
  });
  const [result, setResult] = useState<SendMessageResult | null>(null);
  const [showUuidSearch, setShowUuidSearch] = useState(false);
  const [usernameSearch, setUsernameSearch] = useState('');
  const [uuidLoading, setUuidLoading] = useState(false);
  const [uuidError, setUuidError] = useState<string | null>(null);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const receiverValue = watch('receiver');

  // Check if receiverValue is a valid UUID (simple regex)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiverValue);

  // Lookup username if receiver is a UUID
  React.useEffect(() => {
    if (isUuid) {
      setUsernameLoading(true);
      setResolvedUsername(null);
      setUsernameError(null);
      getUsernameByUuid(receiverValue)
        .then(username => {
          setResolvedUsername(username ?? null);
        })
        .catch(() => setUsernameError('Could not resolve username.'))
        .finally(() => setUsernameLoading(false));
    } else {
      setResolvedUsername(null);
    }
  }, [receiverValue]);

  const handleUuidSearch = async () => {
    setUuidLoading(true);
    setUuidError(null);
    try {
      const uuid = await getUuidByUsername(usernameSearch);
      if (uuid) {
        setValue('receiver', uuid, { shouldValidate: true });
        setShowUuidSearch(false);
        setUsernameSearch('');
      } else {
        setUuidError('No UUID found for that username.');
      }
    } catch (e) {
      setUuidError('Error looking up UUID.');
    } finally {
      setUuidLoading(false);
    }
  };

  const onSubmit = async (values: SendMessageForm) => {
    setResult(null);
    const res = await sendMessage({
      ...values,
      description: values.description ?? ''
    });
    setResult(res);
    if (res.success) reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md mx-auto p-6 bg-white dark:bg-neutral-900 rounded-xl shadow">
      <div className="text-center mb-2">
        <span className="font-semibold text-cyan-700 dark:text-cyan-300">Sending a message costs <b>1 credit</b>.</span>
      </div>
      <div>
        <label className="block font-medium mb-1">To (Username or UUID)</label>
        <div className="flex gap-2 items-center">
          <input {...register('receiver')} className="input input-bordered w-full" />
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowUuidSearch(v => !v)}>
            Find UUID by Username
          </button>
        </div>
        {errors.receiver && <span className="text-red-500 text-sm">{errors.receiver.message}</span>}
        {showUuidSearch && (
          <div className="mt-2 flex gap-2 items-center">
            <input
              type="text"
              value={usernameSearch}
              onChange={e => setUsernameSearch(e.target.value)}
              placeholder="Enter username"
              className="input input-bordered input-sm w-40"
              disabled={uuidLoading}
            />
            <button type="button" className="btn btn-sm btn-accent" onClick={handleUuidSearch} disabled={uuidLoading || !usernameSearch}>
              {uuidLoading ? 'Searching...' : 'Lookup'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setShowUuidSearch(false)}>
              Cancel
            </button>
            {uuidError && <span className="text-red-500 text-xs ml-2">{uuidError}</span>}
          </div>
        )}
        {isUuid && (
          <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
            {usernameLoading ? 'Resolving username...' :
              resolvedUsername ? `Receiver: ${resolvedUsername}` :
              usernameError ? <span className="text-red-500">{usernameError}</span> : null}
          </div>
        )}
      </div>
      <div>
        <label className="block font-medium mb-1">Title</label>
        <input {...register('title')} className="input input-bordered w-full" />
        {errors.title && <span className="text-red-500 text-sm">{errors.title.message}</span>}
      </div>
      <div>
        <label className="block font-medium mb-1">Description (optional)</label>
        <input {...register('description')} className="input input-bordered w-full" />
        {errors.description && <span className="text-red-500 text-sm">{errors.description.message}</span>}
      </div>
      <div>
        <label className="block font-medium mb-1">Message</label>
        <textarea {...register('message')} className="textarea textarea-bordered w-full min-h-[80px]" />
        {errors.message && <span className="text-red-500 text-sm">{errors.message.message}</span>}
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send Message (1 credit)'}
      </button>
      {result && (
        <div className={result.success ? 'text-green-600 mt-2' : 'text-red-600 mt-2'}>
          {result.success ? 'Message sent successfully!' : `Error: ${result.error}`}
        </div>
      )}
    </form>
  );
};

