/** @jsxImportSource react */
import React, { useEffect, useState, Suspense } from 'react';
import { useStore } from '@nanostores/react';
import { FiberProvider } from 'its-fine';

import {
	$heroDiceState,
	initHeroDice,
	setHeroDiceRolling,
	setHeroDiceValues,
} from './DiceStore';

const DiceCanvas = React.lazy(() => import('./DiceCanvas'));


export default function HeroInteractiveClient() {
	const state = useStore($heroDiceState);

	useEffect(() => {
		initHeroDice();
	}, []);

	const roll = () => {
		setHeroDiceRolling(true);
		setTimeout(() => {
			const newValues = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
			setHeroDiceValues(newValues);
			setHeroDiceRolling(false);
		}, 1500);
	};

    return (
        <div className="transition-opacity duration-700 ease-out w-full h-auto opacity-100">
          <div className="rounded-xl overflow-hidden shadow-xl w-full h-[250px] sm:h-[300px] md:h-[400px]">
            <Suspense fallback={<div className="text-white text-sm">Loading canvas...</div>}>
            <FiberProvider>
              <DiceCanvas values={state.values} rolling={state.rolling} />
            </FiberProvider>
            </Suspense>
          </div>
          <div className="mt-6 flex flex-row space-x-3 items-center z-40">
            <div className="mt-4 text-zinc-200 text-lg text-center min-h-[3rem]">
              <button
                onClick={roll}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50"
                aria-label="Roll the dice"
                disabled={state.rolling}>
                Roll the Dice 🎲
              </button>
            </div>
            <div className="mt-4 text-zinc-200 text-lg text-center min-h-[3rem]">
              {state.rolling ? (
                <p className="text-white">Rolling dice...</p>
              ) : (
                <>
                  <p>
                    Total roll:{' '}
                    <span className="font-bold text-white">
                      {state.values.reduce((sum, val) => sum + val, 0)}
                    </span>
                  </p>
                  <p>
                    You rolled:{' '}
                    <span className="font-bold text-white">
                      {state.values.join(', ')}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }