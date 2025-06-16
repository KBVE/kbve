import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferSchema, transferBalance, TransferInput } from './transferBalance';
import { useStore } from '@nanostores/react';
import { userBalanceAtom, syncUserBalance, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { clsx, twMerge } from 'src/utils/tw';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

const UserTransferRPC: React.FC = () => {
  const userId = useStore(userIdAtom);
  const balance = useStore(userBalanceAtom);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingData, setPendingData] = useState<TransferInput | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<{ error?: any; data?: any } | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<TransferInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: { kind: 'credit' as const }
  });

  const onSubmit = (data: TransferInput) => {
    setPendingData(data);
    setModalOpen(true);
  };

  const handleConfirm = async () => {
    if (pendingData && confirmText === 'CONFIRM') {
      const res = await transferBalance(pendingData);
      setResult(res);
      setModalOpen(false);
      setConfirmText('');
      reset();
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h3 className="text-xl font-bold mb-4">Transfer Balance</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input {...register('to_user')} placeholder="Recipient User UUID" className="input input-bordered" />
        {errors.to_user && <span className="text-red-500 text-xs">{errors.to_user.message}</span>}
        <select {...register('kind')} className="input input-bordered">
          <option value="credit">Credit</option>
          <option value="khash">KHash</option>
        </select>
        <input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} placeholder="Amount" className="input input-bordered" />
        {errors.amount && <span className="text-red-500 text-xs">{errors.amount.message}</span>}
        <input {...register('reason')} placeholder="Reason" className="input input-bordered" />
        {errors.reason && <span className="text-red-500 text-xs">{errors.reason.message}</span>}
        <button type="submit" className={twMerge('btn btn-primary', isSubmitting && 'opacity-50')}>Submit</button>
      </form>
      {result && (
        <div className="mt-4">
          {result.error ? (
            <div className="text-red-600">Error: {result.error.message || String(result.error)}</div>
          ) : (
            <div className="text-green-600">Transfer successful!</div>
          )}
        </div>
      )}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-xl w-full max-w-sm flex flex-col items-center gap-4">
            <h4 className="text-lg font-bold">Confirm Transfer</h4>
            <div className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">
              Are you sure you want to send <b>{pendingData?.amount.toFixed(2)}</b> {pendingData?.kind} to <b>{pendingData?.to_user}</b>?<br />
              Reason: <i>{pendingData?.reason}</i>
            </div>
            <input
              type="text"
              placeholder="Type CONFIRM to proceed"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="input input-bordered w-full"
            />
            <div className="flex gap-2 w-full">
              <button
                className={twMerge('btn btn-primary flex-1', confirmText !== 'CONFIRM' && 'opacity-50 pointer-events-none')}
                onClick={handleConfirm}
                disabled={confirmText !== 'CONFIRM'}
              >
                Confirm
              </button>
              <button className="btn btn-secondary flex-1" onClick={() => { setModalOpen(false); setConfirmText(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserTransferRPC;
