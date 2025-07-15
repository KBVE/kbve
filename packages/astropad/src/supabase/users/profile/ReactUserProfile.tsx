/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { userClientService, supabase } from '@kbve/astropad';
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  User,
  BadgeCheck,
  MailCheck,
  Link2,
  ListTree,
  X
} from 'lucide-react';

const hideSkeleton = () => {
  const skeleton = document.querySelector('[data-skeleton="user-profile"]') as HTMLElement;
  if (skeleton) {
    skeleton.style.display = 'none';
  }
};

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};



export const ReactUserProfile = () => {

    const [selectedPanel, setSelectedPanel] = useState<null | string>(null);    
    const user = useStore(userClientService.userAtom);

        
    const displayName = useMemo(() => {
    if (!user) return 'Guest';
        return user.user_metadata?.display_name || user.user_metadata?.username || user.email || 'User';
    }, [user]);


    useEffect(() => {
        hideSkeleton();
    }, []);

};