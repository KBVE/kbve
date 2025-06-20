import React from 'react';
import { useStore } from '@nanostores/react';
import { userAtom } from './userstate';

const getAvatarUrl = (user: any) => {
  // Prefer user_metadata.avatar_url, fallback to Gravatar
  if (user?.user_metadata?.avatar_url) return user.user_metadata.avatar_url;
  if (user?.email) {
    const hash = window.btoa(user.email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?d=identicon`;
  }
  return '/assets/items/set/masks/anbu.png';
};

const UserAvatar: React.FC = () => {
  const user = useStore(userAtom);
  if (!user) return null;

  const avatarUrl = getAvatarUrl(user);
  const emailVerified = user.email_confirmed_at || user.confirmed_at;
  const phoneVerified = user.phone_confirmed_at || user.phone && user.phone_confirmed_at !== null;
  const providers = user.app_metadata?.providers || [];

  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={avatarUrl}
        alt="User Avatar"
        className="w-20 h-20 rounded-full border-4 border-cyan-400 shadow-lg object-cover"
      />
      <div className="flex items-center gap-2 mt-1">
        {emailVerified ? (
          <span className="text-green-500 text-xs font-semibold bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Email Verified
          </span>
        ) : (
          <span className="text-yellow-500 text-xs font-semibold bg-yellow-100 dark:bg-yellow-900 px-2 py-0.5 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" /></svg>
            Email Not Verified
          </span>
        )}
        {user.phone && (
          phoneVerified ? (
            <span className="text-green-500 text-xs font-semibold bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Phone Verified
            </span>
          ) : (
            <span className="text-yellow-500 text-xs font-semibold bg-yellow-100 dark:bg-yellow-900 px-2 py-0.5 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" /></svg>
              Phone Not Verified
            </span>
          )
        )}
      </div>
      {providers.length > 0 && (
        <div className="flex gap-2 mt-1">
          {providers.map((prov: string) => (
            <span key={prov} className="text-xs bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full font-semibold">
              {prov.charAt(0).toUpperCase() + prov.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
