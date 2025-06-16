import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferSchema, transferBalance, type TransferInput } from './transferBalance';
import { useStore } from '@nanostores/react';
import { userBalanceAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { clsx, twMerge } from 'src/utils/tw';

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
    <div className="max-w-md mx-auto p-6 rounded-2xl shadow-xl bg-gradient-to-br from-cyan-50/80 to-purple-50/60 dark:from-cyan-900/40 dark:to-purple-900/30 border border-cyan-200 dark:border-zinc-800 backdrop-blur-md bg-white/60 dark:bg-zinc-900/60">
      <h3 className="text-2xl font-bold mb-4 text-cyan-700 dark:text-cyan-200 drop-shadow">Transfer Balance</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1">Recipient User UUID</label>
          <input {...register('to_user')} placeholder="Recipient User UUID" className={twMerge('input input-bordered w-full bg-white/80 dark:bg-zinc-800/70 text-neutral-900 dark:text-neutral-100 border-cyan-300 dark:border-cyan-700 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 placeholder:text-neutral-400 dark:placeholder:text-neutral-500', errors.to_user && 'border-red-400 focus:border-red-500')} />
          {errors.to_user && <span className="text-red-500 text-xs mt-1 block">{errors.to_user.message}</span>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1">Asset Type</label>
          <select {...register('kind')} className={twMerge('input input-bordered w-full bg-white/80 dark:bg-zinc-800/70 text-neutral-900 dark:text-neutral-100 border-cyan-300 dark:border-cyan-700 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400', errors.kind && 'border-red-400 focus:border-red-500')}>
            <option value="credit">Credit</option>
            <option value="khash">KHash</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1">Amount</label>
          <input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} placeholder="Amount" className={twMerge('input input-bordered w-full bg-white/80 dark:bg-zinc-800/70 text-neutral-900 dark:text-neutral-100 border-cyan-300 dark:border-cyan-700 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 placeholder:text-neutral-400 dark:placeholder:text-neutral-500', errors.amount && 'border-red-400 focus:border-red-500')} />
          {errors.amount && <span className="text-red-500 text-xs mt-1 block">{errors.amount.message}</span>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1">Reason</label>
          <input {...register('reason')} placeholder="Reason for transfer" className={twMerge('input input-bordered w-full bg-white/80 dark:bg-zinc-800/70 text-neutral-900 dark:text-neutral-100 border-cyan-300 dark:border-cyan-700 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 placeholder:text-neutral-400 dark:placeholder:text-neutral-500', errors.reason && 'border-red-400 focus:border-red-500')} />
          {errors.reason && <span className="text-red-500 text-xs mt-1 block">{errors.reason.message}</span>}
        </div>
        <button type="submit" className={twMerge('btn btn-primary bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold py-2 rounded-lg shadow hover:from-cyan-600 hover:to-purple-600 transition-colors duration-200', isSubmitting && 'opacity-50')}>Submit</button>
      </form>
      {result && (
        <div className="mt-4">
          {result.error ? (
            <div className="text-red-600 font-semibold bg-red-100 dark:bg-red-900/40 rounded-lg px-4 py-2">Error: {result.error.message || String(result.error)}</div>
          ) : (
            <div className="text-green-700 font-semibold bg-green-100 dark:bg-green-900/40 rounded-lg px-4 py-2">Transfer successful!</div>
          )}
        </div>
      )}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white/70 dark:bg-zinc-900/70 rounded-2xl p-8 shadow-2xl w-full max-w-sm flex flex-col items-center gap-5 border border-cyan-200 dark:border-zinc-800 backdrop-blur-lg">
            <h4 className="text-xl font-bold text-cyan-700 dark:text-cyan-200 mb-2">Confirm Transfer</h4>
            <div className="text-base text-neutral-700 dark:text-neutral-200 mb-2 text-center">
              Are you sure you want to send <b className="text-cyan-600 dark:text-cyan-300">{pendingData?.amount.toFixed(2)}</b> <span className="uppercase">{pendingData?.kind}</span> to <b className="text-purple-600 dark:text-purple-300">{pendingData?.to_user}</b>?<br />
              <span className="italic text-sm text-neutral-500 dark:text-neutral-400">Reason: {pendingData?.reason}</span>
            </div>
            <input
              type="text"
              placeholder="Type CONFIRM to proceed"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="input input-bordered w-full text-center font-mono tracking-widest text-lg bg-white/80 dark:bg-zinc-800/70 text-neutral-900 dark:text-neutral-100 border-cyan-300 dark:border-cyan-700 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
            <div className="flex gap-2 w-full mt-2">
              <button
                className={twMerge('btn btn-primary flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold py-2 rounded-lg shadow', confirmText !== 'CONFIRM' && 'opacity-50 pointer-events-none')}
                onClick={handleConfirm}
                disabled={confirmText !== 'CONFIRM'}
              >
                Confirm
              </button>
              <button className="btn btn-secondary flex-1 bg-neutral-200 dark:bg-zinc-800 text-neutral-700 dark:text-neutral-200 rounded-lg" onClick={() => { setModalOpen(false); setConfirmText(''); }}>
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
