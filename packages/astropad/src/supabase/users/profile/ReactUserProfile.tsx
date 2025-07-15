/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { userClientService, supabase } from '@kbve/astropad';
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  User,
  BadgeCheck,
  MailCheck,
  Link2,
  ListTree,
  X
} from 'lucide-react';