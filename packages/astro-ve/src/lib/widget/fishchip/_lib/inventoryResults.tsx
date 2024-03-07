import { persistentAtom } from '@nanostores/persistent'
import React from 'react';

export const totalScoreStore = persistentAtom('totalScore', '0'); // Assumes the default score is 0

export const InventoryResults = () => {

   const [totalScore, setTotalScore] = React.useState(totalScoreStore.get());

   React.useEffect(() => {
      // Subscribe to the store's updates
      const unsubscribe = totalScoreStore.subscribe((newScore) => {
         console.log('New totalScore:', newScore);
         setTotalScore(newScore);
     });
      // Cleanup subscription on component unmount
      return () => unsubscribe();
  }, []);



    return (
     <div>
        Your Inventory! {totalScore}
        Go to the <a href="/arcade/fishchip/inn/">inn</a>
     </div>
    );
  };