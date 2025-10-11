import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { Inbox, Send, Mail, RefreshCcw } from 'lucide-react';
import { mailboxMessagesAtom, mailboxLoadingAtom, mailboxErrorAtom, fetchAndCacheMailbox } from './mailboxstate';

const TABS = [
  { key: 'all', label: 'All', icon: <Mail size={18} /> },
  { key: 'sent', label: 'Sent', icon: <Send size={18} /> },
  { key: 'received', label: 'Received', icon: <Inbox size={18} /> },
];

export const Mailbox: React.FC = () => {
  const userId = useStore(userIdAtom);
  const messages = useStore(mailboxMessagesAtom);
  const loading = useStore(mailboxLoadingAtom);
  const error = useStore(mailboxErrorAtom);
  const [tab, setTab] = useState<'all' | 'sent' | 'received'>('all');

  useEffect(() => {
    fetchAndCacheMailbox();
  }, []);

  const filteredMessages = useMemo(() => {
    if (tab === 'all') return messages;
    if (tab === 'sent') return messages.filter(m => m.sender === userId);
    if (tab === 'received') return messages.filter(m => m.receiver === userId);
    return messages;
  }, [messages, tab, userId]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg font-medium border transition ${tab === t.key ? 'bg-cyan-600 text-white border-cyan-700' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:bg-cyan-100 dark:hover:bg-cyan-900'}`}
            onClick={() => setTab(t.key as any)}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button
          className="ml-auto flex items-center gap-1 px-3 py-2 rounded-lg border border-cyan-400 text-cyan-700 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-900 hover:bg-cyan-100 dark:hover:bg-cyan-800 transition"
          onClick={fetchAndCacheMailbox}
          title="Refresh"
        >
          <RefreshCcw size={16} />
        </button>
      </div>
      <div className="bg-white/80 dark:bg-neutral-900/80 rounded-xl shadow border border-neutral-200 dark:border-neutral-800 p-4 min-h-[300px] flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-12">Loading messages...</div>
        ) : error ? (
          <div className="text-center text-red-500 py-12">{error}</div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-12">No messages found.</div>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {filteredMessages.map((msg, idx) => (
              <li key={msg.id || idx} className="py-4 flex items-start gap-4">
                <span className={`mt-1 ${msg.sender === userId ? 'text-cyan-500' : 'text-yellow-500'}`}>
                  {msg.sender === userId ? <Send size={20} /> : <Inbox size={20} />}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-100">{msg.title}</span>
                    <span className="text-xs text-neutral-400">{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                    {msg.message}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                    {msg.sender === userId ? (
                      <>To: <span className="font-medium">{msg.receiver_username || msg.receiver}</span></>
                    ) : (
                      <>From: <span className="font-medium">{msg.sender_username || msg.sender}</span></>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

