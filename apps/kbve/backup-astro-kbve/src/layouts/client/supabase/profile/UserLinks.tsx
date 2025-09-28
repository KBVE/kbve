import React from 'react';

const links = [
  {
    label: 'Messages',
    href: '/messages',
    icon: (
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.8l-4 1 1-4A8.96 8.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    ),
  },
  {
    label: 'Logout',
    href: '/logout',
    icon: (
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" /></svg>
    ),
  },
  {
    label: 'IGBC',
    href: '/igbc',
    icon: (
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 8v8m8-8a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
    ),
  },
];

const UserLinks: React.FC = () => (
  <div className="flex flex-col gap-3 w-full items-center">
    {links.map((link) => (
      <a
        key={link.label}
        href={link.href}
        className="flex items-center w-full max-w-xs px-4 py-2 rounded-lg bg-gradient-to-br from-cyan-100/60 to-purple-100/60 dark:from-cyan-900/40 dark:to-purple-900/40 text-cyan-900 dark:text-cyan-100 font-semibold shadow hover:from-cyan-200 hover:to-purple-200 dark:hover:from-cyan-800 dark:hover:to-purple-800 transition"
      >
        {link.icon}
        {link.label}
      </a>
    ))}
  </div>
);

export default UserLinks;
