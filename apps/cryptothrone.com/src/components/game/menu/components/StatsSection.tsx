import React from 'react';
import * as Laser from '@kbve/laser';

interface StatsSectionProps {
    stats: Laser.IPlayerStats;
}

const StatsSection: React.FC<StatsSectionProps> = ({ stats }) => {
    const getPercentage = (value: number | string, max: number | string) => {
        const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
        const numericMax = typeof max === 'string' ? parseInt(max, 10) : max;
        return Math.min((numericValue / numericMax) * 100, 100);
    };

    return (
        <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Stats</h2>
            <div className="mb-2">
                <p className="text-sm text-green-400">{`HP: ${stats.health || '0'} / ${stats.maxHealth}`}</p>
                <div className="w-full bg-gray-300 h-4 rounded">
                    <div
                        className="bg-green-400 h-full rounded"
                        style={{ width: `${getPercentage(stats.health, stats.maxHealth)}%` }}
                    ></div>
                </div>
            </div>
            <div className="mb-2">
                <p className="text-sm text-blue-400">{`MP: ${stats.mana || '0'} / ${stats.maxMana}`}</p>
                <div className="w-full bg-gray-300 h-4 rounded">
                    <div
                        className="bg-blue-400 h-full rounded"
                        style={{ width: `${getPercentage(stats.mana, stats.maxMana)}%` }}
                    ></div>
                </div>
            </div>
            <div className="mb-2">
                <p className="text-sm text-yellow-400">{`EP: ${stats.energy || '0'} / ${stats.maxEnergy}`}</p>
                <div className="w-full bg-gray-300 h-4 rounded">
                    <div
                        className="bg-yellow-400 h-full rounded"
                        style={{ width: `${getPercentage(stats.energy, stats.maxEnergy)}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
};

export default StatsSection;
