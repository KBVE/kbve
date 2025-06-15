import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';
import { clsx, twMerge } from 'src/utils/tw';
import {
  emailAtom,
  passwordAtom,
  errorAtom,
  successAtom,
  loadingAtom,
} from './loginstatestate';
import { loginUser, signInWithDiscord, signInWithGithub } from './factory-login';

// Modal component for feedback
const StatusModal = ({ open, loading, error, success, onClose }: { open: boolean, loading: boolean, error: string, success: string, onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 text-white rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative">
        {loading && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-400 mb-4"></div>
            <div className="text-lg font-semibold mb-2">Logging in…</div>
          </>
        )}
        {!loading && (error || success) && (
          <>
            <div className={error ? 'text-red-400 text-lg font-semibold mb-2' : 'text-green-400 text-lg font-semibold mb-2'}>
              {error || success}
            </div>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold shadow">Close</button>
          </>
        )}
      </div>
    </div>
  );
};

export const Login = () => {
  const email = useStore(emailAtom);
  const password = useStore(passwordAtom);
  const error = useStore(errorAtom);
  const success = useStore(successAtom);
  const loading = useStore(loadingAtom);

  const setEmail = (v: string) => emailAtom.set(v);
  const setPassword = (v: string) => passwordAtom.set(v);
  const setError = (v: string) => errorAtom.set(v);
  const setSuccess = (v: string) => successAtom.set(v);
  const setLoading = (v: boolean) => loadingAtom.set(v);

  type FormValues = {
    email: string;
    password: string;
  };

  const {
    handleSubmit,
    register,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      email,
      password,
    },
  });

  const [modalOpen, setModalOpen] = useState(false);

  const onSubmit = async (data: FormValues) => {
    setError('');
    setSuccess('');
    setModalOpen(true);
    setLoading(true);
    try {
      await loginUser();
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  return (
    <>
      <StatusModal open={modalOpen} loading={loading} error={error} success={success} onClose={handleCloseModal} />
      <div className="flex flex-col gap-2 mb-6">
        <button
          onClick={signInWithGithub}
          className="flex items-center justify-center gap-2 w-full py-2 rounded bg-black text-white font-semibold shadow hover:bg-gray-800 transition"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/></svg>
          Continue with GitHub
        </button>
        <button
          onClick={signInWithDiscord}
          className="flex items-center justify-center gap-2 w-full py-2 rounded bg-[#5865F2] text-white font-semibold shadow hover:bg-[#4752c4] transition"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
          Continue with Discord
        </button>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={twMerge(
          'login-form flex flex-col gap-4',
        )}
        style={{ maxWidth: 400, margin: '0 auto' }}
      >
        <h2 className="text-2xl font-bold text-center mb-2 text-white [text-shadow:_0_1px_2px_black] shadow-black shadow-lg">Login</h2>
        {error && <div className="text-red-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{error}</div>}
        {success && <div className="text-green-500 text-center [text-shadow:_0_1px_2px_black] shadow-black shadow-md">{success}</div>}
        <div>
          <label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Email</span></label>
          <input
            type="email"
            {...register('email', { required: 'Email is required' })}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setValue('email', e.target.value);
            }}
            className={clsx(
              'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
              errors.email && 'border-red-500',
            )}
          />
          {errors.email && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.email.message}</span>}
        </div>
        <div>
          <label className="block mb-1 font-medium"><span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Password</span></label>
          <input
            type="password"
            {...register('password', { required: 'Password is required' })}
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              setValue('password', e.target.value);
            }}
            className={clsx(
              'block w-full rounded border px-3 py-2 bg-white/80 dark:bg-stone-900/80 text-white [text-shadow:_0_1px_2px_black] shadow-black',
              errors.password && 'border-red-500',
            )}
          />
          {errors.password && <span className="text-red-500 text-sm [text-shadow:_0_1px_2px_black] shadow-black">{errors.password.message}</span>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className={twMerge(
            'block w-full py-2 rounded bg-gradient-to-br from-cyan-500 to-purple-500 text-white font-semibold shadow hover:from-cyan-400 hover:to-purple-400 transition drop-shadow-[0_1px_2px_rgba(0,0,0,1)] shadow-black shadow-lg',
            loading && 'opacity-60 cursor-not-allowed',
          )}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <div className="mt-4 text-center">
          <span className="text-white [text-shadow:_0_1px_2px_black] shadow-black">Don't have an account?{' '}
            <a href="/register" className="underline text-cyan-200 hover:text-cyan-400">Register here</a>
          </span>
        </div>
      </form>
    </>
  );
};
