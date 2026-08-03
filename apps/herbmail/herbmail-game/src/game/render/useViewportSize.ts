import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';

// R3F mints a fresh state.size object on every <Canvas> render: its guard in
// configure() compares a measured-bounds object (8 keys — width/height/top/left
// plus bottom/right/x/y) against the stored size (4 keys), and its shallow
// comparison bails on the first key the stored one lacks, so the guard can never
// pass. Selecting the object therefore re-renders every consumer several times a
// second for a viewport that never changed, and because that arrives as a store
// update rather than a prop change it walks straight through React.memo.
// Selecting the two scalars we actually use makes the identity churn invisible.
export function useViewportSize(): { width: number; height: number } {
	const width = useThree((s) => s.size.width);
	const height = useThree((s) => s.size.height);
	return useMemo(() => ({ width, height }), [width, height]);
}
