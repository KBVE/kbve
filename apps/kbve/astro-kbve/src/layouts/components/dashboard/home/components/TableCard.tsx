import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
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
    const fadeOutSkeleton = () => {
      const skeleton = document.getElementById('table-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.3s ease-out';
        skeleton.style.opacity = '0';
        setTimeout(() => {
          skeleton.style.display = 'none';
        }, 300);
      }
    };

    const fetchTableData = async () => {
      try {
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
        fadeOutSkeleton();
        setTimeout(() => {
          setVisible(true);
        }, 400);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching table data:', error);
        fadeOutSkeleton();
        setTimeout(() => {
          setVisible(true);
        }, 400);
        setLoading(false);
      }
    };

    fetchTableData();
  }, [isGuest]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'pending': return 'text-yellow-400 bg-yellow-400/10';
      case 'completed': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-zinc-400 bg-zinc-400/10';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Account':
      case 'Public': return <User className="w-4 h-4" />;
      case 'Transaction':
      case 'Upgrade': return <Star className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className={twMerge(clsx(
      "transition-opacity duration-500",
      visible ? "opacity-100" : "opacity-0"
    ))}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={twMerge(clsx("text-xl font-semibold text-white"))}>
          {isGuest ? 'Latest Updates' : 'Recent Transactions'}
        </h3>
        <button className={twMerge(clsx(
          "px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg",
          "text-sm font-medium transition-colors"
        ))}>
          View All
        </button>
      </div>
      
      <div className="space-y-3">
        {tableData.map((item, index) => (
          <div 
            key={item.id} 
            className={twMerge(clsx(
              "flex items-center space-x-4 p-3 rounded-lg",
              "hover:bg-zinc-700/30 transition-colors"
            ))}
            style={{ animationDelay: `${0.6 + (index * 0.1)}s` }}
          >
            <div className={twMerge(clsx(
              "w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center"
            ))}>
              <span className={twMerge(clsx("text-cyan-400"))}>
                {getTypeIcon(item.type)}
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className={twMerge(clsx("text-white text-sm font-medium"))}>
                  {item.name}
                </h4>
                <span className={twMerge(clsx(
                  "px-2 py-1 rounded-full text-xs",
                  getStatusColor(item.status)
                ))}>
                  {item.status}
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-1">
                <span className={twMerge(clsx("text-zinc-400 text-xs"))}>
                  {item.type}
                </span>
                <span className={twMerge(clsx("text-zinc-500 text-xs"))}>•</span>
                <span className={twMerge(clsx("text-zinc-400 text-xs"))}>
                  {item.date}
                </span>
              </div>
            </div>
            
            <button className={twMerge(clsx(
              "w-8 h-8 rounded-lg hover:bg-zinc-700 flex items-center justify-center transition-colors"
            ))}>
              <MoreHorizontal className={twMerge(clsx("w-4 h-4 text-zinc-400"))} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableCard;
