import { useFrame, useThree } from '@react-three/fiber';
import { DungeonScene } from './DungeonScene';
import { updatePlayerWorld, useActiveRooms } from './dungeon/store';

function Streamer() {
	const camera = useThree((s) => s.camera);
	useFrame(() => {
		updatePlayerWorld(camera.position.x, camera.position.z);
	});
	return null;
}

interface Props {
	snap: number;
	affine: number;
}

export function Dungeon({ snap, affine }: Props) {
	const rooms = useActiveRooms();
	return (
		<>
			<Streamer />
			{rooms.map((r) => (
				<DungeonScene
					key={r.key}
					grid={r.grid}
					snap={snap}
					affine={affine}
				/>
			))}
		</>
	);
}
