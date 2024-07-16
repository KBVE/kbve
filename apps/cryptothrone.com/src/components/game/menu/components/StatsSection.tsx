import React from 'react';
import * as Laser from '@kbve/laser';

interface StatsSectionProps {
    stats: Laser.IPlayerStats
}

const StatsSection: React.FC<StatsSectionProps> = ({stats}) => {
    return (
        <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Stats</h2>
        <p className="text-sm text-green-400">{`HP: ${stats.health || '0'} / ${stats.maxHealth}`}</p>
        <p className="text-sm text-blue-400">{`MP: ${stats.mana || '0'} / ${stats.maxMana}`}</p>
        <p className="text-sm text-yellow-400">{`EP: ${stats.energy || '0'} / ${stats.maxEnergy}`}</p>
      </div>
    );
}

export default StatsSection;