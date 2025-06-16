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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-lg mx-auto p-10 bg-white/70 dark:bg-neutral-900/80 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 backdrop-blur-md">
      <div className="text-center mb-6">
        <span className="font-bold text-xl text-cyan-800 dark:text-cyan-200 tracking-tight">Send a Message <span className='text-base font-medium'>(1 credit)</span></span>
      </div>
      <div className="space-y-2">
        <label className="block font-semibold text-neutral-800 dark:text-neutral-100">To (Username or UUID)</label>
        <div className="flex gap-2 items-center">
          <input {...register('receiver')} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2 text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition" />
          <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 border border-cyan-200 dark:border-cyan-700 hover:bg-cyan-200 dark:hover:bg-cyan-800 transition" onClick={() => setShowUuidSearch(v => !v)}>
            Find UUID
          </button>
        </div>
        {errors.receiver && <span className="text-red-500 text-xs mt-1 block">{errors.receiver.message}</span>}
        {showUuidSearch && (
          <div className="mt-2 flex gap-2 items-center">
            <input
              type="text"
              value={usernameSearch}
              onChange={e => setUsernameSearch(e.target.value)}
              placeholder="Enter username"
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition w-40"
              disabled={uuidLoading}
            />
            <button type="button" className="rounded-lg px-3 py-1 text-sm font-medium bg-cyan-200 dark:bg-cyan-800 text-cyan-900 dark:text-cyan-100 border border-cyan-300 dark:border-cyan-600 hover:bg-cyan-300 dark:hover:bg-cyan-700 transition" onClick={handleUuidSearch} disabled={uuidLoading || !usernameSearch}>
              {uuidLoading ? 'Searching...' : 'Lookup'}
            </button>
            <button type="button" className="rounded-lg px-3 py-1 text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition" onClick={() => setShowUuidSearch(false)}>
              Cancel
            </button>
            {uuidError && <span className="text-red-500 text-xs ml-2">{uuidError}</span>}
          </div>
        )}
        {isUuid && (
          <div className="mt-1 text-xs text-cyan-700 dark:text-cyan-200 font-medium">
            {usernameLoading ? 'Resolving username...' :
              resolvedUsername ? `Receiver: ${resolvedUsername}` :
              usernameError ? <span className="text-red-500">{usernameError}</span> : null}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="block font-semibold text-neutral-800 dark:text-neutral-100">Title</label>
        <input {...register('title')} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2 text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition" />
        {errors.title && <span className="text-red-500 text-xs mt-1 block">{errors.title.message}</span>}
      </div>
      <div className="space-y-2">
        <label className="block font-semibold text-neutral-800 dark:text-neutral-100">Description (optional)</label>
        <input {...register('description')} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2 text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition" />
        {errors.description && <span className="text-red-500 text-xs mt-1 block">{errors.description.message}</span>}
      </div>
      <div className="space-y-2">
        <label className="block font-semibold text-neutral-800 dark:text-neutral-100">Message</label>
        <textarea {...register('message')} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2 text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition min-h-[120px]" />
        {errors.message && <span className="text-red-500 text-xs mt-1 block">{errors.message.message}</span>}
      </div>
      <button type="submit" className="w-full rounded-lg py-3 text-base font-semibold bg-cyan-600 dark:bg-cyan-700 hover:bg-cyan-700 dark:hover:bg-cyan-600 border border-cyan-700 dark:border-cyan-600 text-white dark:text-neutral-100 shadow-lg transition" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send Message (1 credit)'}
      </button>
      {result && (
        <div className={result.success ? 'text-green-600 mt-4 text-center font-medium' : 'text-red-600 mt-4 text-center font-medium'}>
          {result.success ? 'Message sent successfully!' : `Error: ${result.error}`}
        </div>
      )}
    </form>
  );
};

