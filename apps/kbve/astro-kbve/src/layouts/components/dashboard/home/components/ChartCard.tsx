import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { BarChart3, TrendingUp, Download, Share } from 'lucide-react';

interface ChartData {
  title: string;
  subtitle: string;
  values: number[];
}

const ChartCard = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [visible, setVisible] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.querySelector('[data-skeleton="charts"]') as HTMLElement;
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

    const fetchChartData = async () => {
      try {
        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Generate chart data based on user type
        const data: ChartData = isGuest ? {
          title: 'Platform Overview',
          subtitle: 'Public statistics and trends',
          values: [45, 52, 48, 61, 55, 67, 72]
        } : {
          title: 'Your Activity',
          subtitle: 'Personal usage analytics',
          values: [12, 19, 15, 25, 22, 30, 28]
        };

        setChartData(data);
        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching chart data:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    fetchChartData();
  }, [isGuest]);

  if (loading || !chartData) {
    return null; // Skeletons handled by Astro
  }

  return (
    <div className={clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/30 transition-all duration-300 group",
      visible ? "opacity-100" : "opacity-0"
    )}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white group-hover:text-cyan-50 transition-colors duration-300">
            {chartData.title}
          </h3>
          <p className="text-zinc-400 text-sm mt-1 group-hover:text-zinc-300 transition-colors duration-300">
            {chartData.subtitle}
          </p>
        </div>
        <div className="flex space-x-2">
          <button className="w-8 h-8 bg-zinc-700 hover:bg-cyan-500/20 hover:border-cyan-500/50 border border-transparent rounded flex items-center justify-center transition-all duration-300 group/btn">
            <Download className="w-4 h-4 text-zinc-400 group-hover/btn:text-cyan-400 transition-colors duration-300" />
          </button>
          <button className="w-8 h-8 bg-zinc-700 hover:bg-cyan-500/20 hover:border-cyan-500/50 border border-transparent rounded flex items-center justify-center transition-all duration-300 group/btn">
            <Share className="w-4 h-4 text-zinc-400 group-hover/btn:text-cyan-400 transition-colors duration-300" />
          </button>
        </div>
      </div>
      
      {/* Interactive bar chart visualization */}
      <div className="h-64 bg-zinc-700/30 rounded-lg p-4 flex items-end justify-between group-hover:bg-zinc-700/40 transition-colors duration-300">
        {chartData.values.map((value: number, index: number) => (
          <div key={index} className="flex flex-col items-center space-y-2 group/bar cursor-pointer">
            <div 
              className="bg-cyan-400 rounded-t transition-all duration-1000 group-hover/bar:bg-cyan-300 group-hover/bar:scale-110"
              style={{ 
                height: `${(value / Math.max(...chartData.values)) * 200}px`,
                width: '20px',
                animationDelay: `${index * 100}ms`
              }}
            ></div>
            <span className="text-zinc-400 text-xs group-hover/bar:text-cyan-400 transition-colors duration-300">
              {index + 1}
            </span>
          </div>
        ))}
      </div>
      
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300 transition-colors duration-300" />
          <span className="text-zinc-300 group-hover:text-white transition-colors duration-300">
            {isGuest ? 'Weekly Activity' : 'Your Progress'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <TrendingUp className="w-4 h-4 text-green-400 group-hover:text-green-300 transition-colors duration-300" />
          <span className="text-green-400 group-hover:text-green-300 transition-colors duration-300">+15.3%</span>
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
