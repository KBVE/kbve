import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom } from 'src/layouts/client/supabase/profile/userstate';
import { BarChart3, TrendingUp, Download, Share, User, Settings, LogOut, Bell } from 'lucide-react';
