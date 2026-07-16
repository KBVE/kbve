import { useFrame, useThree } from '@react-three/fiber';
import { RoomView } from './RoomView';
import { useDungeonMaterials } from './dungeonMaterials';
import { updatePlayerWorld, useActiveRooms } from './store';

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
	const mats = useDungeonMaterials(snap, affine);
	return (
		<>
			<Streamer />
			{rooms.map((r) => (
				<RoomView
					key={r.key}
					desc={r.desc}
					snap={snap}
					affine={affine}
					mats={mats}
				/>
			))}
		</>
	);
}
