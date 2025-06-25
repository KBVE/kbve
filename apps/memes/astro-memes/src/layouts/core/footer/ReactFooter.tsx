import React, { useState, useEffect } from "react";
import { clsx, twMerge } from 'src/layouts/core/tw';
import { useStore } from '@nanostores/react';
import { isAuthenticated, userProfile } from '../stores/userStore';

import { 
  Theater, 
  Github, 
  Twitter, 
  MessageCircle as Discord, 
  Mail,
  Heart,
  ExternalLink
} from 'lucide-react';

interface ReactFooterProps {
  className?: string;
}

export const ReactFooter: React.FC<ReactFooterProps> = ({ className }) => {
  const authenticated = useStore(isAuthenticated);
  const profile = useStore(userProfile);

  useEffect(() => {
    // Signal that the footer has fully mounted
    const skeleton = document.getElementById('footer-skeleton-loader');
    const content = document.getElementById('footer-content');
    
    if (skeleton && content) {
      // Small delay to ensure React has fully rendered
      setTimeout(() => {
        skeleton.style.opacity = '0';
        content.style.opacity = '1';
        
        // Remove skeleton from DOM after fade completes
        setTimeout(() => {
          skeleton.remove();
        }, 500);
      }, 50);
    }
  }, []);

  const quickLinks = [
    { label: 'Home', href: '/' },
    { label: 'Memes', href: '/memes' },
    { label: 'Create', href: '/create' },
    { label: 'Trending', href: '/trending' },
    { label: 'About', href: '/about' }
  ];

  const communityLinks = [
    { label: 'Discord', href: '#', icon: Discord },
    { label: 'GitHub', href: 'https://github.com/kbve/kbve', icon: Github, external: true },
    { label: 'Support', href: '/support' }
  ];

  const legalLinks = [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' }
  ];

  const socialLinks = [
    { icon: Github, href: 'https://github.com/kbve/kbve', label: 'GitHub' },
    { icon: Twitter, href: '#', label: 'Twitter' },
    { icon: Discord, href: '#', label: 'Discord' },
    { icon: Mail, href: 'mailto:contact@meme.sh', label: 'Email' }
  ];

  return (
    <footer className={twMerge(
      'bg-zinc-900/90 backdrop-blur-md border-t border-zinc-700',
      className
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <Theater size={32} className="text-emerald-400 transition-all duration-500 hover:scale-125 hover:rotate-[360deg] hover:text-green-300 drop-shadow-lg" />
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                Meme.sh
              </span>
            </div>
            <p className="text-neutral-400 text-sm leading-relaxed mb-6 max-w-md">
              The ultimate destination for meme creators and enthusiasts. Share, discover, and create 
              the funniest content on the internet with our vibrant community.
            </p>
            
            {/* Social Links */}
            <div className="flex space-x-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className={clsx(
                    'p-2 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10',
                    'transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-emerald-500/20',
                    'border border-zinc-700 hover:border-emerald-500/50'
                  )}
                  aria-label={social.label}
                  target={social.href.startsWith('http') ? '_blank' : undefined}
                  rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                  <social.icon size={20} />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div className="col-span-1">
            <h3 className="text-lg font-semibold text-neutral-200 mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={clsx(
                      'text-neutral-400 hover:text-emerald-400 transition-all duration-300',
                      'hover:translate-x-1 inline-block text-sm'
                    )}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div className="col-span-1">
            <h3 className="text-lg font-semibold text-neutral-200 mb-4">Community</h3>
            <ul className="space-y-3">
              {communityLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={clsx(
                      'text-neutral-400 hover:text-emerald-400 transition-all duration-300',
                      'hover:translate-x-1 inline-flex items-center space-x-2 text-sm group'
                    )}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noopener noreferrer' : undefined}
                  >
                    {link.icon && <link.icon size={16} className="group-hover:scale-110 transition-transform duration-300" />}
                    <span>{link.label}</span>
                    {link.external && <ExternalLink size={12} className="opacity-50 group-hover:opacity-100 transition-opacity duration-300" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-zinc-700 mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 text-neutral-400 text-sm mb-4 md:mb-0">
              <span>© 2025 Meme.sh. Made with</span>
              <Heart size={16} className="text-red-400 animate-pulse" />
              <span>by the</span>
              <a 
                href="https://kbve.com/" 
                target="_blank" 
                rel="noopener"
                className="text-emerald-400 hover:text-emerald-300 transition-colors duration-300 hover:underline font-medium"
              >
                KBVE team
              </a>
            </div>
            
            <div className="flex flex-wrap justify-center md:justify-end space-x-6">
              {legalLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'text-neutral-400 hover:text-emerald-400 transition-colors duration-300 text-sm',
                    'hover:underline'
                  )}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* User Status */}
          {authenticated && (
            <div className="mt-6 pt-6 border-t border-zinc-700">
              <div className="text-center">
                <p className="text-neutral-400 text-sm">
                  Welcome back, <span className="text-emerald-400 font-medium">{profile?.username || profile?.email?.split('@')[0]}</span>! 
                  Keep creating amazing memes! 🎭
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};