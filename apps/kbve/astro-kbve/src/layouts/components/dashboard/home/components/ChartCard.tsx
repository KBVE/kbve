import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { BarChart3, TrendingUp, Download, Share } from 'lucide-react';

const ChartCard = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any>(null);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    const fadeOutSkeleton = () => {
      const skeleton = document.getElementById('chart-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.3s ease-out';
        skeleton.style.opacity = '0';
        setTimeout(() => {
          skeleton.style.display = 'none';
        }, 300);
      }
    };

    const fetchChartData = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Simulate chart data based on user type
        const data = isGuest ? {
          title: 'Platform Overview',
          subtitle: 'Public statistics and trends',
          values: [45, 52, 48, 61, 55, 67, 72]
        } : {
          title: 'Your Activity',
          subtitle: 'Personal usage analytics',
          values: [12, 19, 15, 25, 22, 30, 28]
        };

        setChartData(data);
        fadeOutSkeleton();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching chart data:', error);
        fadeOutSkeleton();
        setLoading(false);
      }
    };

    fetchChartData();
  }, [isGuest]);

  if (loading) {
    return null;
  }

  return (
    <div className={twMerge(clsx("opacity-0 animate-fade-in"))} 
         style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className={twMerge(clsx("text-xl font-semibold text-white"))}>
            {chartData?.title}
          </h3>
          <p className={twMerge(clsx("text-zinc-400 text-sm mt-1"))}>
            {chartData?.subtitle}
          </p>
        </div>
        <div className="flex space-x-2">
          <button className={twMerge(clsx(
            "w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded",
            "flex items-center justify-center transition-colors"
          ))}>
            <Download className={twMerge(clsx("w-4 h-4 text-zinc-400"))} />
          </button>
          <button className={twMerge(clsx(
            "w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded",
            "flex items-center justify-center transition-colors"
          ))}>
            <Share className={twMerge(clsx("w-4 h-4 text-zinc-400"))} />
          </button>
        </div>
      </div>
      
      {/* Simple bar chart visualization */}
      <div className={twMerge(clsx("h-64 bg-zinc-700/30 rounded-lg p-4 flex items-end justify-between"))}>
        {chartData?.values.map((value: number, index: number) => (
          <div key={index} className="flex flex-col items-center space-y-2">
            <div 
              className={twMerge(clsx("bg-cyan-400 rounded-t transition-all duration-1000"))}
              style={{ 
                height: `${(value / Math.max(...chartData.values)) * 200}px`,
                width: '20px',
                animationDelay: `${index * 100}ms`
              }}
            ></div>
            <span className={twMerge(clsx("text-zinc-400 text-xs"))}>
              {index + 1}
            </span>
          </div>
        ))}
      </div>
      
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2">
          <BarChart3 className={twMerge(clsx("w-4 h-4 text-cyan-400"))} />
          <span className={twMerge(clsx("text-zinc-300"))}>
            {isGuest ? 'Weekly Activity' : 'Your Progress'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <TrendingUp className={twMerge(clsx("w-4 h-4 text-green-400"))} />
          <span className={twMerge(clsx("text-green-400"))}>+15.3%</span>
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
