import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { User, Calendar, Star, MoreHorizontal } from 'lucide-react';

interface TableItem {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'pending' | 'completed';
  date: string;
  avatar?: string;
}

const TableCard = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<TableItem[]>([]);
  const [visible, setVisible] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.querySelector('[data-skeleton="tables"]') as HTMLElement;
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out';
        skeleton.style.opacity = '0';
        skeleton.style.pointerEvents = 'none';
        skeleton.style.zIndex = '-1';
        skeleton.style.visibility = 'hidden';
      }
      
      // Fade in this component with a small delay for smooth transition
      setTimeout(() => setVisible(true), 100);
    };

    const fetchTableData = async () => {
      try {
        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 1400));
        
        const data: TableItem[] = isGuest ? [
          {
            id: '1',
            name: 'Featured Content',
            type: 'Public',
            status: 'active',
            date: '2 hours ago'
          },
          {
            id: '2',
            name: 'Community Updates',
            type: 'News',
            status: 'active',
            date: '5 hours ago'
          },
          {
            id: '3',
            name: 'Platform Features',
            type: 'Guide',
            status: 'completed',
            date: '1 day ago'
          }
        ] : [
          {
            id: '1',
            name: 'Profile Update',
            type: 'Account',
            status: 'completed',
            date: '1 hour ago'
          },
          {
            id: '2',
            name: 'Credit Purchase',
            type: 'Transaction',
            status: 'completed',
            date: '3 hours ago'
          },
          {
            id: '3',
            name: 'Feature Access',
            type: 'Upgrade',
            status: 'pending',
            date: '6 hours ago'
          },
          {
            id: '4',
            name: 'Monthly Report',
            type: 'Analytics',
            status: 'active',
            date: '1 day ago'
          }
        ];

        setTableData(data);
        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching table data:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    fetchTableData();
  }, [isGuest]);

  const getStatusColor = useMemo(() => {
    return (status: string) => {
      switch (status) {
        case 'active': return 'text-green-400 bg-green-400/10 border border-green-400/20';
        case 'pending': return 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20';
        case 'completed': return 'text-blue-400 bg-blue-400/10 border border-blue-400/20';
        default: return 'text-zinc-400 bg-zinc-400/10 border border-zinc-400/20';
      }
    };
  }, []);

  const getTypeIcon = useMemo(() => {
    return (type: string) => {
      switch (type) {
        case 'Account':
        case 'Public': return <User className="w-4 h-4" />;
        case 'Transaction':
        case 'Upgrade': return <Star className="w-4 h-4" />;
        default: return <Calendar className="w-4 h-4" />;
      }
    };
  }, []);

  if (loading || !tableData.length) {
    return null; // Skeletons handled by Astro
  }

  return (
    <div className={clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/30 transition-all duration-300 group",
      visible ? "opacity-100" : "opacity-0"
    )}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white group-hover:text-cyan-50 transition-colors duration-300">
          {isGuest ? 'Latest Updates' : 'Recent Transactions'}
        </h3>
        <button className="px-4 py-2 bg-zinc-700 hover:bg-cyan-500/20 hover:border-cyan-500/50 border border-transparent text-white rounded-lg text-sm font-medium transition-all duration-300 group/btn hover:text-cyan-100">
          View All
        </button>
      </div>
      
      <div className="space-y-3">
        {tableData.map((item, index) => (
          <div 
            key={item.id} 
            className="flex items-center space-x-4 p-3 rounded-lg hover:bg-zinc-700/50 hover:scale-[1.02] transition-all duration-300 group/item cursor-pointer will-change-transform"
            style={{ animationDelay: `${0.6 + (index * 0.1)}s` }}
          >
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover/item:bg-cyan-500/20 group-hover/item:scale-110 transition-all duration-300">
              <span className="text-cyan-400 group-hover/item:text-cyan-300 transition-colors duration-300">
                {getTypeIcon(item.type)}
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-white text-sm font-medium group-hover/item:text-cyan-50 transition-colors duration-300">
                  {item.name}
                </h4>
                <span className={clsx(
                  "px-2 py-1 rounded-full text-xs transition-all duration-300 group-hover/item:scale-105",
                  getStatusColor(item.status)
                )}>
                  {item.status}
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-zinc-400 text-xs group-hover/item:text-zinc-300 transition-colors duration-300">
                  {item.type}
                </span>
                <span className="text-zinc-500 text-xs">•</span>
                <span className="text-zinc-400 text-xs group-hover/item:text-zinc-300 transition-colors duration-300">
                  {item.date}
                </span>
              </div>
            </div>
            
            <button className="w-8 h-8 rounded-lg hover:bg-cyan-500/20 hover:border-cyan-500/50 border border-transparent flex items-center justify-center transition-all duration-300 group/more">
              <MoreHorizontal className="w-4 h-4 text-zinc-400 group-hover/more:text-cyan-400 transition-colors duration-300" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableCard;
