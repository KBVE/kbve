import {
	useRef,
	useState,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Html, OrbitControls, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import {
	hardSkills,
	softSkills,
	characterKeyPoints,
	magicalRunes,
	getSkillLevelColor,
	getSkillLevelLabel,
	type Skill,
	type CharacterKeyPoint,
	type MagicalRune,
} from './jay_service';

interface ReactJayYukiProps {
	width?: number;
	height?: number;
}

const MOBILE_BREAKPOINT = 768;

function SkillDrawer({
	isOpen,
	side,
	skills,
	title,
	onClose,
}: {
	isOpen: boolean;
	side: 'left' | 'right';
	skills: Skill[];
	title: string;
	onClose: () => void;
}) {
	const drawerStyles: React.CSSProperties = {
		position: 'absolute',
		top: 0,
		[side]: 0,
		width: '280px',
		maxWidth: '85vw',
		height: '100%',
		background: 'rgba(30, 41, 59, 0.98)',
		backdropFilter: 'blur(8px)',
		transform: isOpen
			? 'translateX(0)'
			: `translateX(${side === 'left' ? '-100%' : '100%'})`,
		transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
		zIndex: 100,
		display: 'flex',
		flexDirection: 'column',
		borderRight:
			side === 'left' ? '2px solid rgba(96, 165, 250, 0.3)' : 'none',
		borderLeft:
			side === 'right' ? '2px solid rgba(168, 85, 247, 0.3)' : 'none',
		boxShadow: isOpen
			? `${side === 'left' ? '4px' : '-4px'} 0 20px rgba(0, 0, 0, 0.5)`
			: 'none',
	};

	const headerStyles: React.CSSProperties = {
		padding: '1rem',
		borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		background:
			side === 'left'
				? 'rgba(59, 130, 246, 0.1)'
				: 'rgba(168, 85, 247, 0.1)',
	};

	const titleStyles: React.CSSProperties = {
		margin: 0,
		fontSize: '1.125rem',
		fontWeight: 600,
		color: '#fff',
	};

	const closeButtonStyles: React.CSSProperties = {
		background: 'rgba(255, 255, 255, 0.1)',
		border: 'none',
		color: '#fff',
		width: '32px',
		height: '32px',
		borderRadius: '50%',
		cursor: 'pointer',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: '1.25rem',
		transition: 'background 0.2s',
	};

	const skillsListStyles: React.CSSProperties = {
		flex: 1,
		overflowY: 'auto',
		padding: '0.75rem',
	};

	const skillCardStyles: React.CSSProperties = {
		background: 'rgba(255, 255, 255, 0.05)',
		borderRadius: '0.5rem',
		padding: '0.75rem',
		marginBottom: '0.5rem',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		transition: 'transform 0.2s, background 0.2s',
	};

	return (
		<div style={drawerStyles}>
			<div style={headerStyles}>
				<h3 style={titleStyles}>{title}</h3>
				<button
					onClick={onClose}
					style={closeButtonStyles}
					onMouseEnter={(e) =>
						(e.currentTarget.style.background =
							'rgba(255, 255, 255, 0.2)')
					}
					onMouseLeave={(e) =>
						(e.currentTarget.style.background =
							'rgba(255, 255, 255, 0.1)')
					}
					type="button"
					aria-label="Close drawer">
					×
				</button>
			</div>
			<div style={skillsListStyles}>
				{skills.map((skill) => (
					<div
						key={skill.id}
						style={skillCardStyles}
						onMouseEnter={(e) => {
							e.currentTarget.style.background =
								'rgba(255, 255, 255, 0.1)';
							e.currentTarget.style.transform = 'translateX(4px)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background =
								'rgba(255, 255, 255, 0.05)';
							e.currentTarget.style.transform = 'translateX(0)';
						}}>
						<div
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'flex-start',
								marginBottom: '0.25rem',
							}}>
							<span
								style={{
									fontWeight: 600,
									color: '#fff',
									fontSize: '0.9rem',
								}}>
								{skill.name}
							</span>
							{skill.level && (
								<span
									style={{
										fontSize: '0.65rem',
										padding: '0.125rem 0.5rem',
										borderRadius: '9999px',
										background: `${getSkillLevelColor(skill.level)}22`,
										color: getSkillLevelColor(skill.level),
										fontWeight: 500,
									}}>
									{getSkillLevelLabel(skill.level)}
								</span>
							)}
						</div>
						<p
							style={{
								margin: 0,
								fontSize: '0.75rem',
								color: 'rgba(255, 255, 255, 0.7)',
								lineHeight: 1.4,
							}}>
							{skill.description}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

function DialogueBox({
	text,
	isVisible,
	onClose,
}: {
	text: string;
	isVisible: boolean;
	onClose: () => void;
}) {
	if (!isVisible) return null;

	const boxStyles: React.CSSProperties = {
		position: 'absolute',
		bottom: '1rem',
		left: '50%',
		transform: 'translateX(-50%)',
		width: '90%',
		maxWidth: '500px',
		background: 'rgba(15, 23, 42, 0.95)',
		backdropFilter: 'blur(8px)',
		borderRadius: '0.75rem',
		padding: '1rem',
		border: '2px solid rgba(96, 165, 250, 0.4)',
		boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
		zIndex: 50,
		animation: 'fadeSlideUp 0.3s ease-out',
	};

	return (
		<div style={boxStyles} onClick={onClose}>
			<p
				style={{
					color: '#fff',
					fontSize: '0.9rem',
					lineHeight: 1.6,
					margin: 0,
				}}>
				{text}
			</p>
			<div
				style={{
					textAlign: 'right',
					marginTop: '0.5rem',
					fontSize: '0.7rem',
					color: 'rgba(255, 255, 255, 0.5)',
				}}>
				Click to dismiss
			</div>
		</div>
	);
}

function MobileSkillButtons({
	onLeftClick,
	onRightClick,
}: {
	onLeftClick: () => void;
	onRightClick: () => void;
}) {
	const containerStyles: React.CSSProperties = {
		position: 'absolute',
		bottom: '1rem',
		left: '50%',
		transform: 'translateX(-50%)',
		display: 'flex',
		gap: '1rem',
		zIndex: 40,
	};

	const buttonStyles: React.CSSProperties = {
		padding: '0.75rem 1.25rem',
		borderRadius: '2rem',
		border: 'none',
		fontWeight: 600,
		fontSize: '0.875rem',
		cursor: 'pointer',
		transition: 'transform 0.2s, box-shadow 0.2s',
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
	};

	return (
		<div style={containerStyles}>
			<button
				onClick={onLeftClick}
				style={{
					...buttonStyles,
					background:
						'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
					color: '#fff',
					boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
				}}
				type="button">
				<span>📚</span> Hard Skills
			</button>
			<button
				onClick={onRightClick}
				style={{
					...buttonStyles,
					background:
						'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
					color: '#fff',
					boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)',
				}}
				type="button">
				<span>💡</span> Soft Skills
			</button>
		</div>
	);
}

interface BookSlot {
	id: string;
	skillIndex: number;
	uvMinX: number;
	uvMaxX: number;
	uvMinY: number;
	uvMaxY: number;
}

function generateBookSlots(skills: Skill[]): BookSlot[] {
	const slots: BookSlot[] = [];
	const cols = 6;
	const rows = Math.ceil(skills.length / cols);

	skills.forEach((skill, index) => {
		const col = index % cols;
		const row = Math.floor(index / cols);

		slots.push({
			id: skill.id,
			skillIndex: index,
			uvMinX: col / cols,
			uvMaxX: (col + 1) / cols,
			uvMinY: row / rows,
			uvMaxY: (row + 1) / rows,
		});
	});

	return slots;
}

function findBookAtUV(
	uv: { x: number; y: number },
	slots: BookSlot[],
): BookSlot | null {
	for (const slot of slots) {
		if (
			uv.x >= slot.uvMinX &&
			uv.x <= slot.uvMaxX &&
			uv.y >= slot.uvMinY &&
			uv.y <= slot.uvMaxY
		) {
			return slot;
		}
	}
	return null;
}

const BOOK_COLORS = [
	{ hex: 0x3388ff, css: '#3388ff' },
	{ hex: 0x33cc66, css: '#33cc66' },
	{ hex: 0xffcc33, css: '#ffcc33' },
	{ hex: 0xff8833, css: '#ff8833' },
	{ hex: 0xaa66ff, css: '#aa66ff' },
];

function getBookColor(index: number): { hex: number; css: string } {
	return BOOK_COLORS[index % BOOK_COLORS.length];
}

function Bookshelf({
	position,
	rotation,
	scale,
	onClick,
	onBookHover,
	side,
	skills,
}: {
	position: [number, number, number];
	rotation?: [number, number, number];
	scale?: number;
	onClick: (skillIndex?: number) => void;
	onBookHover?: (
		skill: Skill | null,
		uv: { x: number; y: number } | null,
	) => void;
	side: 'left' | 'right';
	skills: Skill[];
}) {
	const { scene } = useGLTF('/jay/bookshelf/scene.gltf');
	const groupRef = useRef<THREE.Group>(null);
	const [hoveredBook, setHoveredBook] = useState<BookSlot | null>(null);
	const [hoveredUV, setHoveredUV] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [hoveredMeshId, setHoveredMeshId] = useState<number | null>(null);
	const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(
		null,
	);
	const clonedScene = useRef<THREE.Group | null>(null);
	const meshMap = useRef<Map<number, THREE.Mesh>>(new Map());
	const bookSlots = useRef<BookSlot[]>(generateBookSlots(skills));

	const currentColorRef = useRef(new THREE.Color(BOOK_COLORS[0].css));
	const targetColorRef = useRef(new THREE.Color(BOOK_COLORS[0].css));
	const displayColorRef = useRef({
		css: BOOK_COLORS[0].css,
		hex: BOOK_COLORS[0].hex,
	});
	const [displayColor, setDisplayColor] = useState(BOOK_COLORS[0]);

	if (!clonedScene.current) {
		clonedScene.current = scene.clone();
		meshMap.current.clear();

		clonedScene.current.traverse((child) => {
			if (child instanceof THREE.Mesh && child.material) {
				if (Array.isArray(child.material)) {
					child.material = child.material.map((m) => m.clone());
				} else {
					child.material = child.material.clone();
				}
				meshMap.current.set(child.id, child);
			}
		});
	}

	useFrame((_, delta) => {
		if (hoveredBook) {
			const targetColor = getBookColor(hoveredBook.skillIndex);
			targetColorRef.current.set(targetColor.css);
		} else {
			targetColorRef.current.set(BOOK_COLORS[0].css);
		}

		const lerpSpeed = 3;
		currentColorRef.current.lerp(
			targetColorRef.current,
			Math.min(1, delta * lerpSpeed),
		);

		const newHex = currentColorRef.current.getHexString();
		if (displayColorRef.current.css !== `#${newHex}`) {
			displayColorRef.current = {
				css: `#${newHex}`,
				hex: currentColorRef.current.getHex(),
			};
			setDisplayColor({
				css: `#${newHex}`,
				hex: currentColorRef.current.getHex(),
			});
		}

		meshMap.current.forEach((mesh, id) => {
			const isHovered = id === hoveredMeshId;
			const materials = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];

			materials.forEach((mat) => {
				if (
					mat instanceof THREE.MeshStandardMaterial ||
					mat instanceof THREE.MeshPhysicalMaterial
				) {
					if (isHovered && hoveredBook) {
						mat.emissive.copy(currentColorRef.current);
						mat.emissiveIntensity = 0.2;
					} else {
						mat.emissive.setHex(0x000000);
						mat.emissiveIntensity = 0;
					}
				}
			});
		});
	});

	const handlePointerMove = useCallback(
		(e: {
			stopPropagation: () => void;
			uv?: THREE.Vector2;
			point: THREE.Vector3;
			object: THREE.Object3D;
		}) => {
			e.stopPropagation();
			document.body.style.cursor = 'pointer';

			if (groupRef.current) {
				const localPoint = groupRef.current.worldToLocal(
					e.point.clone(),
				);
				setCursorPos([localPoint.x, localPoint.y, localPoint.z + 0.5]);
			}

			if (
				e.object instanceof THREE.Mesh &&
				meshMap.current.has(e.object.id)
			) {
				setHoveredMeshId(e.object.id);
			}

			if (e.uv) {
				const uv = { x: e.uv.x, y: e.uv.y };
				setHoveredUV(uv);

				const book = findBookAtUV(uv, bookSlots.current);
				setHoveredBook(book);

				if (onBookHover) {
					onBookHover(book ? skills[book.skillIndex] : null, uv);
				}
			}
		},
		[skills, onBookHover],
	);

	const handlePointerLeave = useCallback(() => {
		setHoveredBook(null);
		setHoveredUV(null);
		setHoveredMeshId(null);
		setCursorPos(null);
		document.body.style.cursor = 'auto';
		if (onBookHover) {
			onBookHover(null, null);
		}
	}, [onBookHover]);

	const handleClick = useCallback(
		(e: { stopPropagation: () => void }) => {
			e.stopPropagation();
			if (hoveredBook) {
				onClick(hoveredBook.skillIndex);
			} else {
				onClick();
			}
		},
		[hoveredBook, onClick],
	);

	return (
		<group
			ref={groupRef}
			position={position}
			rotation={
				rotation
					? (rotation.map((r) => (r * Math.PI) / 180) as [
							number,
							number,
							number,
						])
					: undefined
			}
			scale={scale}
			onClick={handleClick}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}>
			<primitive object={clonedScene.current} />

			{cursorPos && (
				<group position={cursorPos}>
					<pointLight
						color={displayColor.css}
						intensity={10}
						distance={40}
						decay={2}
					/>
					<mesh rotation={[Math.PI / 2, 0, 0]}>
						<ringGeometry args={[1.5, 2.5, 32]} />
						<meshBasicMaterial
							color={displayColor.css}
							transparent
							opacity={0.8}
							side={THREE.DoubleSide}
						/>
					</mesh>
				</group>
			)}

			{hoveredBook && (
				<Html
					position={[0, 4, 1]}
					center
					style={{
						background: 'rgba(0, 0, 0, 0.9)',
						padding: '0.75rem 1rem',
						borderRadius: '0.5rem',
						color: 'white',
						fontWeight: 500,
						fontSize: '0.875rem',
						whiteSpace: 'nowrap',
						pointerEvents: 'none',
						border: '2px solid rgba(100, 150, 255, 0.7)',
						boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
					}}>
					<div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
						{skills[hoveredBook.skillIndex]?.name ||
							'Unknown Skill'}
					</div>
					<div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
						Click to view details
					</div>
				</Html>
			)}

			{hoveredUV && !hoveredBook && (
				<Html
					position={[0, 4, 1]}
					center
					style={{
						background: 'rgba(0, 0, 0, 0.8)',
						padding: '0.5rem 1rem',
						borderRadius: '0.5rem',
						color: 'white',
						fontWeight: 500,
						fontSize: '0.75rem',
						whiteSpace: 'nowrap',
						pointerEvents: 'none',
						border: '1px solid rgba(100, 150, 255, 0.5)',
					}}>
					UV: ({hoveredUV.x.toFixed(2)}, {hoveredUV.y.toFixed(2)})
				</Html>
			)}

			<Html
				position={[0, -2, 0.5]}
				center
				style={{
					background:
						side === 'left'
							? 'rgba(59, 130, 246, 0.9)'
							: 'rgba(168, 85, 247, 0.9)',
					padding: '0.5rem 1rem',
					borderRadius: '0.5rem',
					color: 'white',
					fontWeight: 600,
					fontSize: '0.875rem',
					whiteSpace: 'nowrap',
					pointerEvents: 'none',
				}}>
				{side === 'left' ? 'Hard Skills' : 'Soft Skills'}
			</Html>
		</group>
	);
}

type BookPhase =
	| 'emerging'
	| 'traveling'
	| 'opening'
	| 'open'
	| 'closing'
	| 'returning'
	| 'complete';

function PopupBook({
	isVisible,
	onOpenComplete,
}: {
	isVisible: boolean;
	onOpenComplete?: () => void;
}) {
	const groupRef = useRef<THREE.Group>(null);
	const modelRef = useRef<THREE.Group>(null);
	const { scene, animations } = useGLTF('/jay/poem/scene.gltf');
	const openCompleteRef = useRef(false);
	const materialsFixed = useRef(false);

	useEffect(() => {
		if (materialsFixed.current) return;
		materialsFixed.current = true;

		scene.traverse((child) => {
			child.visible = true;
			child.frustumCulled = false;

			if (child instanceof THREE.Mesh) {
				child.visible = true;
				child.frustumCulled = false;

				if (child.material) {
					const mats = Array.isArray(child.material)
						? child.material
						: [child.material];
					mats.forEach((mat) => {
						mat.visible = true;
						mat.side = THREE.DoubleSide;
						mat.depthWrite = true;
						mat.depthTest = true;
					});
				}
			}
		});
	}, [scene]);

	const { actions, mixer } = useAnimations(animations, modelRef);

	useEffect(() => {
		if (!isVisible || !actions) return;

		const action = actions['Animation'];
		if (action) {
			openCompleteRef.current = false;
			action.reset();
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
			action.timeScale = 0.8;
			action.play();
		} else {
			onOpenComplete?.();
		}
	}, [isVisible, actions, onOpenComplete]);

	useEffect(() => {
		if (!mixer || !isVisible) return;

		const handleFinished = () => {
			if (!openCompleteRef.current) {
				openCompleteRef.current = true;
				onOpenComplete?.();
			}
		};

		mixer.addEventListener('finished', handleFinished);
		return () => mixer.removeEventListener('finished', handleFinished);
	}, [mixer, isVisible, onOpenComplete]);

	useFrame((_, delta) => {
		if (!groupRef.current) return;
		const targetScale = isVisible ? 0.4 : 0;
		const currentScale = groupRef.current.scale.x;
		const newScale = THREE.MathUtils.lerp(
			currentScale,
			targetScale,
			delta * 3,
		);
		groupRef.current.scale.setScalar(newScale);
	});

	return (
		<group
			ref={groupRef}
			position={[0, -0.2, 1.5]}
			rotation={[0.2, 0, 0]}
			scale={0}>
			<group ref={modelRef}>
				<primitive object={scene} />
			</group>
		</group>
	);
}

function AnimatedBook({
	onAnimationComplete,
	onCloseComplete,
	shelfSide = 'left',
	isClosing = false,
	onPhaseChange,
}: {
	onAnimationComplete?: () => void;
	onCloseComplete?: () => void;
	shelfSide?: 'left' | 'right';
	isClosing?: boolean;
	onPhaseChange?: (phase: BookPhase) => void;
}) {
	const groupRef = useRef<THREE.Group>(null);
	const { scene, animations } = useGLTF('/jay/simplebook/scene.gltf');
	const { actions, mixer } = useAnimations(animations, groupRef);

	const [phase, setPhase] = useState<BookPhase>('emerging');
	const phaseProgress = useRef(0);
	const hasStartedOpening = useRef(false);
	const openStopTime = useRef(1.6);

	useEffect(() => {
		onPhaseChange?.(phase);
	}, [phase, onPhaseChange]);

	const shelfPos =
		shelfSide === 'left'
			? { x: -2.2, y: -0.8, z: 0 }
			: { x: 2.2, y: -0.8, z: 0 };
	const centerPos = { x: 0, y: 0.2, z: 1.5 };
	const shelfScale = 0.3;
	const centerScale = 0.45;

	const startRotY = shelfSide === 'left' ? -Math.PI / 2 : Math.PI / 2;

	useEffect(() => {
		if (isClosing && phase === 'open') {
			setPhase('closing');
		}
	}, [isClosing, phase]);

	useFrame((_, delta) => {
		if (!groupRef.current) return;

		if (phase === 'emerging') {
			phaseProgress.current = Math.min(
				1,
				phaseProgress.current + delta * 3,
			);
			const t = phaseProgress.current;
			const eased = 1 - Math.pow(1 - t, 2);

			const scale = 0.1 + eased * (shelfScale - 0.1);
			groupRef.current.scale.set(scale, scale, scale);

			groupRef.current.position.x = shelfPos.x;
			groupRef.current.position.y = shelfPos.y;
			groupRef.current.position.z = shelfPos.z + eased * 0.3;

			groupRef.current.rotation.x = Math.PI / 2;
			groupRef.current.rotation.y =
				startRotY + eased * (shelfSide === 'left' ? 0.2 : -0.2);
			groupRef.current.rotation.z = 0;

			if (phaseProgress.current >= 1) {
				phaseProgress.current = 0;
				setPhase('traveling');
			}
		} else if (phase === 'traveling') {
			phaseProgress.current = Math.min(
				1,
				phaseProgress.current + delta * 0.7,
			);
			const t = phaseProgress.current;
			const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

			const scale = shelfScale + eased * (centerScale - shelfScale);
			groupRef.current.scale.set(scale, scale, scale);

			const startZ = shelfPos.z + 0.3;
			groupRef.current.position.x =
				shelfPos.x + eased * (centerPos.x - shelfPos.x);
			groupRef.current.position.y =
				shelfPos.y + eased * (centerPos.y - shelfPos.y);
			groupRef.current.position.z =
				startZ + eased * (centerPos.z - startZ);

			const startRotation =
				startRotY + (shelfSide === 'left' ? 0.2 : -0.2);
			groupRef.current.rotation.x = Math.PI / 2;
			groupRef.current.rotation.y =
				startRotation + eased * (0 - startRotation);
			groupRef.current.rotation.z = 0;

			if (phaseProgress.current >= 1) {
				setPhase('opening');
			}
		} else if (phase === 'returning') {
			phaseProgress.current = Math.min(
				1,
				phaseProgress.current + delta * 0.9,
			);
			const t = phaseProgress.current;
			const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

			const scale = centerScale - eased * (centerScale - shelfScale);
			groupRef.current.scale.set(scale, scale, scale);

			groupRef.current.position.x =
				centerPos.x + eased * (shelfPos.x - centerPos.x);
			groupRef.current.position.y =
				centerPos.y + eased * (shelfPos.y - centerPos.y);
			groupRef.current.position.z =
				centerPos.z + eased * (shelfPos.z - centerPos.z);

			const endRotY = startRotY + (shelfSide === 'left' ? 0.2 : -0.2);
			groupRef.current.rotation.x = Math.PI / 2;
			groupRef.current.rotation.y = eased * endRotY;
			groupRef.current.rotation.z = 0;

			if (phaseProgress.current >= 1) {
				setPhase('complete');
				onCloseComplete?.();
			}
		}
	});

	useEffect(() => {
		if (phase !== 'opening' || !actions || hasStartedOpening.current)
			return;

		const demoAction = actions['Demo'];
		if (demoAction) {
			hasStartedOpening.current = true;
			demoAction.reset();
			demoAction.setLoop(THREE.LoopOnce, 1);
			demoAction.clampWhenFinished = true;
			demoAction.timeScale = 0.8;
			demoAction.play();

			const checkTime = () => {
				if (demoAction.time >= openStopTime.current) {
					demoAction.paused = true;
					setPhase('open');
					onAnimationComplete?.();
				} else if (!demoAction.paused && phase === 'opening') {
					requestAnimationFrame(checkTime);
				}
			};
			requestAnimationFrame(checkTime);
		} else {
			setPhase('open');
			onAnimationComplete?.();
		}
	}, [phase, actions, onAnimationComplete]);

	useEffect(() => {
		if (phase !== 'closing' || !actions) return;

		const demoAction = actions['Demo'];
		if (demoAction) {
			demoAction.paused = false;
			demoAction.timeScale = 1.2;
		}
	}, [phase, actions]);

	useEffect(() => {
		if (!mixer || phase !== 'closing') return;

		const handleFinished = () => {
			phaseProgress.current = 0;
			setPhase('returning');
		};

		mixer.addEventListener('finished', handleFinished);
		return () => mixer.removeEventListener('finished', handleFinished);
	}, [mixer, phase]);

	return (
		<group
			ref={groupRef}
			scale={0.1}
			position={[shelfPos.x, shelfPos.y, shelfPos.z]}
			rotation={[Math.PI / 2, startRotY, 0]}>
			<primitive object={scene} />
		</group>
	);
}

function BookModal({
	skill,
	onClose,
	shelfSide = 'left',
}: {
	skill: Skill | null;
	onClose: () => void;
	shelfSide?: 'left' | 'right';
}) {
	const [showDetails, setShowDetails] = useState(false);
	const [isClosing, setIsClosing] = useState(false);

	const handleClose = useCallback(() => {
		setIsClosing(true);
		setShowDetails(false);
	}, []);

	const handleCloseComplete = useCallback(() => {
		onClose();
	}, [onClose]);

	if (!skill) return null;

	const modalStyles: React.CSSProperties = {
		position: 'fixed',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		background: 'rgba(0, 0, 0, 0.85)',
		backdropFilter: 'blur(8px)',
		zIndex: 200,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		animation: 'fadeIn 0.3s ease-out',
	};

	const closeButtonStyles: React.CSSProperties = {
		position: 'absolute',
		top: '1rem',
		right: '1rem',
		background: 'rgba(255, 255, 255, 0.1)',
		border: '1px solid rgba(255, 255, 255, 0.3)',
		color: 'white',
		width: '48px',
		height: '48px',
		borderRadius: '50%',
		cursor: 'pointer',
		fontSize: '1.5rem',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		transition: 'all 0.2s',
	};

	const detailsStyles: React.CSSProperties = {
		position: 'absolute',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		background:
			'linear-gradient(135deg, rgba(245, 235, 220, 0.95) 0%, rgba(235, 220, 200, 0.95) 100%)',
		padding: '2rem 2.5rem',
		borderRadius: '0.25rem',
		maxWidth: '420px',
		width: '85%',
		minHeight: '280px',
		boxShadow:
			'inset 0 0 30px rgba(139, 119, 101, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3)',
		opacity: showDetails && !isClosing ? 1 : 0,
		transition: 'opacity 0.4s ease-out',
		pointerEvents: showDetails && !isClosing ? 'auto' : 'none',
		backgroundImage: `
			linear-gradient(135deg, rgba(245, 235, 220, 0.95) 0%, rgba(235, 220, 200, 0.95) 100%),
			url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")
		`,
	};

	return (
		<div style={modalStyles}>
			<style>
				{`
					@keyframes fadeIn {
						from { opacity: 0; }
						to { opacity: 1; }
					}
				`}
			</style>

			<button
				onClick={handleClose}
				style={closeButtonStyles}
				onMouseEnter={(e) => {
					e.currentTarget.style.background =
						'rgba(255, 255, 255, 0.2)';
					e.currentTarget.style.transform = 'scale(1.1)';
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.background =
						'rgba(255, 255, 255, 0.1)';
					e.currentTarget.style.transform = 'scale(1)';
				}}
				type="button">
				×
			</button>

			<div
				style={{
					width: '100%',
					height: '100%',
					position: 'absolute',
					top: 0,
					left: 0,
				}}>
				<Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
					<ambientLight intensity={1.5} />
					<directionalLight position={[5, 5, 5]} intensity={1} />
					<directionalLight position={[-5, 5, 5]} intensity={0.5} />
					<Suspense fallback={null}>
						<AnimatedBook
							onAnimationComplete={() => setShowDetails(true)}
							onCloseComplete={handleCloseComplete}
							shelfSide={shelfSide}
							isClosing={isClosing}
						/>
					</Suspense>
					<OrbitControls
						enableZoom={false}
						enablePan={false}
						minPolarAngle={Math.PI / 3}
						maxPolarAngle={Math.PI / 2}
					/>
				</Canvas>
			</div>

			<div style={detailsStyles}>
				<button
					onClick={handleClose}
					style={{
						position: 'absolute',
						top: '0.5rem',
						right: '0.5rem',
						background: 'rgba(139, 119, 101, 0.2)',
						border: '1px solid rgba(139, 119, 101, 0.4)',
						color: '#6b5344',
						width: '28px',
						height: '28px',
						borderRadius: '50%',
						cursor: 'pointer',
						fontSize: '1rem',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						transition: 'all 0.2s',
						fontFamily: 'Georgia, serif',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background =
							'rgba(139, 119, 101, 0.4)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background =
							'rgba(139, 119, 101, 0.2)';
					}}
					type="button"
					aria-label="Close book">
					×
				</button>

				<h2
					style={{
						margin: '0 0 0.5rem 0',
						color: '#3d2914',
						fontSize: '1.75rem',
						fontFamily: 'Georgia, "Times New Roman", serif',
						fontWeight: 700,
						textAlign: 'center',
						borderBottom: '2px solid rgba(139, 119, 101, 0.4)',
						paddingBottom: '0.75rem',
					}}>
					{skill.name}
				</h2>

				{skill.level && (
					<div
						style={{
							textAlign: 'center',
							marginBottom: '1rem',
							fontStyle: 'italic',
							color: '#6b5344',
							fontSize: '0.9rem',
							fontFamily: 'Georgia, "Times New Roman", serif',
						}}>
						~ {getSkillLevelLabel(skill.level)} ~
					</div>
				)}

				<p
					style={{
						margin: 0,
						color: '#3d2914',
						lineHeight: 1.8,
						fontSize: '1rem',
						fontFamily: 'Georgia, "Times New Roman", serif',
						textAlign: 'justify',
						textIndent: '1.5rem',
					}}>
					{skill.description}
				</p>

				<div
					onClick={handleClose}
					style={{
						position: 'absolute',
						bottom: '0.75rem',
						left: '50%',
						transform: 'translateX(-50%)',
						color: '#6b5344',
						fontSize: '0.8rem',
						fontStyle: 'italic',
						fontFamily: 'Georgia, "Times New Roman", serif',
						cursor: 'pointer',
						opacity: 0.7,
						transition: 'opacity 0.2s',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.opacity = '1';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.opacity = '0.7';
					}}>
					— click to close —
				</div>
			</div>

			{!showDetails && (
				<div
					style={{
						position: 'absolute',
						bottom: '2rem',
						color: 'rgba(255, 255, 255, 0.5)',
						fontSize: '0.875rem',
						animation: 'fadeIn 0.3s ease-out',
					}}>
					Opening book...
				</div>
			)}
		</div>
	);
}

function PoemModal({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const [showContent, setShowContent] = useState(false);
	const [isClosing, setIsClosing] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setShowContent(false);
			setIsClosing(false);
		}
	}, [isOpen]);

	const handleClose = useCallback(() => {
		setIsClosing(true);
		setTimeout(() => {
			onClose();
		}, 500);
	}, [onClose]);

	const handleOpenComplete = useCallback(() => {
		setShowContent(true);
	}, []);

	if (!isOpen) return null;

	const modalStyles: React.CSSProperties = {
		position: 'fixed',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		background: 'rgba(0, 0, 0, 0.9)',
		backdropFilter: 'blur(12px)',
		zIndex: 200,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		animation: 'fadeIn 0.3s ease-out',
	};

	const closeButtonStyles: React.CSSProperties = {
		position: 'absolute',
		top: '1rem',
		right: '1rem',
		background: 'rgba(255, 255, 255, 0.1)',
		border: '1px solid rgba(255, 255, 255, 0.3)',
		color: 'white',
		width: '48px',
		height: '48px',
		borderRadius: '50%',
		cursor: 'pointer',
		fontSize: '1.5rem',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		transition: 'all 0.2s',
		zIndex: 10,
	};

	return (
		<div style={modalStyles}>
			<button
				onClick={handleClose}
				style={closeButtonStyles}
				onMouseEnter={(e) => {
					e.currentTarget.style.background =
						'rgba(255, 255, 255, 0.2)';
					e.currentTarget.style.transform = 'scale(1.1)';
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.background =
						'rgba(255, 255, 255, 0.1)';
					e.currentTarget.style.transform = 'scale(1)';
				}}
				type="button">
				×
			</button>

			<div
				style={{
					width: '100%',
					height: '100%',
					position: 'absolute',
					top: 0,
					left: 0,
				}}>
				<Canvas camera={{ position: [0, 0.5, 4], fov: 50 }}>
					<ambientLight intensity={1.5} />
					<directionalLight position={[5, 5, 5]} intensity={1.2} />
					<directionalLight position={[-5, 5, 5]} intensity={0.8} />
					<pointLight
						position={[0, 2, 3]}
						intensity={2}
						color="#ffeecc"
					/>
					<pointLight
						position={[0, 0, 2]}
						intensity={1.5}
						color="#ffcc88"
					/>
					<Suspense fallback={null}>
						<PopupBook
							isVisible={!isClosing}
							onOpenComplete={handleOpenComplete}
						/>
					</Suspense>
					<OrbitControls
						enableZoom={false}
						enablePan={false}
						minPolarAngle={Math.PI / 4}
						maxPolarAngle={Math.PI / 2}
						minAzimuthAngle={-Math.PI / 6}
						maxAzimuthAngle={Math.PI / 6}
					/>
				</Canvas>
			</div>

			{showContent && !isClosing && (
				<div
					style={{
						position: 'absolute',
						bottom: '2rem',
						left: '50%',
						transform: 'translateX(-50%)',
						maxWidth: '500px',
						width: '90%',
						background: 'rgba(0, 0, 0, 0.7)',
						backdropFilter: 'blur(8px)',
						padding: '1rem 1.5rem',
						borderRadius: '0.75rem',
						border: '1px solid rgba(136, 255, 170, 0.3)',
						textAlign: 'center',
						animation: 'fadeIn 0.5s ease-out',
					}}>
					<p
						style={{
							color: '#ccffee',
							fontSize: '0.95rem',
							lineHeight: 1.7,
							fontFamily: 'Georgia, "Times New Roman", serif',
							fontStyle: 'italic',
							margin: 0,
						}}>
						"Every spell mastered, every bug vanquished,
						<br />
						has been a step on my mystical journey.
						<br />
						From humble scrolls to grand grimoires, I continue to
						learn."
					</p>
					<div
						onClick={handleClose}
						style={{
							marginTop: '0.75rem',
							color: 'rgba(150, 255, 200, 0.6)',
							fontSize: '0.8rem',
							cursor: 'pointer',
						}}>
						— click to close —
					</div>
				</div>
			)}

			{!showContent && !isClosing && (
				<div
					style={{
						position: 'absolute',
						bottom: '2rem',
						color: 'rgba(255, 255, 255, 0.5)',
						fontSize: '0.875rem',
						animation: 'fadeIn 0.3s ease-out',
					}}>
					Opening book...
				</div>
			)}
		</div>
	);
}

const RUNE_PATHS = {
	greeting: `M 50 5 L 61 40 L 98 40 L 68 62 L 79 97 L 50 75 L 21 97 L 32 62 L 2 40 L 39 40 Z`,
	skills: `M 70 10 A 40 40 0 1 0 70 90 A 30 30 0 1 1 70 10`,
	vision: `M 10 50 Q 50 10 90 50 Q 50 90 10 50 M 50 35 A 15 15 0 1 0 50 65 A 15 15 0 1 0 50 35`,
	journey: `M 50 50 m 0 -5 a 5 5 0 1 1 0 10 a 10 10 0 1 1 0 -20 a 15 15 0 1 1 0 30 a 20 20 0 1 1 0 -40 a 25 25 0 1 1 0 50`,
	connect: `M 50 5 L 85 35 L 50 95 L 15 35 Z M 15 35 L 85 35 M 50 5 L 50 95 M 25 55 L 75 55`,
};

function MagicalRuneIcon({
	rune,
	position,
	index,
	onClick,
	isActive,
}: {
	rune: MagicalRune;
	position: [number, number, number];
	index: number;
	onClick: () => void;
	isActive: boolean;
}) {
	const groupRef = useRef<THREE.Group>(null);
	const [hovered, setHovered] = useState(false);
	const baseRotation = useRef((index / 5) * Math.PI * 2);

	useFrame(() => {
		if (!groupRef.current) return;

		const time = Date.now() * 0.0003;
		const orbitRadius = 0.15;
		groupRef.current.position.x =
			position[0] + Math.sin(time + baseRotation.current) * orbitRadius;
		groupRef.current.position.z =
			position[2] + Math.cos(time + baseRotation.current) * orbitRadius;

		groupRef.current.position.y =
			position[1] + Math.sin(Date.now() * 0.002 + index) * 0.05;

		groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.2;
	});

	const runeId = rune.id as keyof typeof RUNE_PATHS;
	const path = RUNE_PATHS[runeId] || RUNE_PATHS.greeting;

	return (
		<group
			ref={groupRef}
			position={position}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onPointerOver={() => {
				setHovered(true);
				document.body.style.cursor = 'pointer';
			}}
			onPointerOut={() => {
				setHovered(false);
				document.body.style.cursor = 'auto';
			}}>
			<pointLight
				color={rune.glowColor}
				intensity={hovered || isActive ? 3 : 1}
				distance={1.5}
				decay={2}
			/>

			<mesh scale={hovered ? 1.15 : 1}>
				<circleGeometry args={[0.25, 32]} />
				<meshBasicMaterial
					color={isActive ? rune.glowColor : rune.color}
					transparent
					opacity={hovered ? 0.9 : 0.7}
				/>
			</mesh>

			<mesh position={[0, 0, 0.01]} scale={hovered ? 1.15 : 1}>
				<ringGeometry args={[0.2, 0.25, 32]} />
				<meshBasicMaterial
					color={rune.glowColor}
					transparent
					opacity={hovered ? 0.8 : 0.4}
				/>
			</mesh>

			<Html
				center
				position={[0, 0, 0.02]}
				style={{
					width: '40px',
					height: '40px',
					pointerEvents: 'none',
					transform: `scale(${hovered ? 1.1 : 1})`,
					transition: 'transform 0.2s ease',
				}}>
				<svg
					viewBox="0 0 100 100"
					width="40"
					height="40"
					style={{
						filter: `drop-shadow(0 0 ${hovered ? '8px' : '4px'} ${rune.glowColor})`,
					}}>
					<path
						d={path}
						fill="none"
						stroke="#ffffff"
						strokeWidth="3"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</Html>

			{hovered && (
				<Html
					center
					position={[0, 0.4, 0]}
					style={{
						background: 'rgba(0, 0, 0, 0.8)',
						padding: '4px 12px',
						borderRadius: '12px',
						color: rune.glowColor,
						fontSize: '12px',
						fontWeight: 'bold',
						whiteSpace: 'nowrap',
						border: `1px solid ${rune.color}`,
						pointerEvents: 'none',
					}}>
					{rune.name}
				</Html>
			)}
		</group>
	);
}

function FloatingParticle({
	delay,
	offset,
}: {
	delay: number;
	offset: [number, number, number];
}) {
	const meshRef = useRef<THREE.Mesh>(null);
	const startTime = useRef(Date.now() + delay * 1000);

	useFrame(() => {
		if (!meshRef.current) return;
		const elapsed = (Date.now() - startTime.current) / 1000;
		const cycle = (elapsed % 2) / 2;

		meshRef.current.position.y = offset[1] + cycle * 1.5;
		meshRef.current.scale.setScalar(0.08 * (1 - cycle * 0.7));
		(meshRef.current.material as THREE.MeshBasicMaterial).opacity =
			0.8 * (1 - cycle);

		if (cycle < 0.01) {
			startTime.current = Date.now();
		}
	});

	return (
		<mesh ref={meshRef} position={offset}>
			<sphereGeometry args={[1, 8, 8]} />
			<meshBasicMaterial color="#aa88ff" transparent opacity={0.8} />
		</mesh>
	);
}

function WitchCharacter({
	onKeyPointClick,
	onRuneClick,
	position = [0, 0, 0] as [number, number, number],
}: {
	onKeyPointClick: (kp: CharacterKeyPoint) => void;
	onRuneClick: (rune: MagicalRune) => void;
	position?: [number, number, number];
}) {
	const [activeRuneId, setActiveRuneId] = useState<string | null>(null);
	const groupRef = useRef<THREE.Group>(null);
	const { scene, animations } = useGLTF('/jay/witch/scene.gltf');
	const { actions } = useAnimations(animations, scene);
	const [hovered, setHovered] = useState(false);
	const materialsModified = useRef(false);

	useEffect(() => {
		if (materialsModified.current) return;
		materialsModified.current = true;

		scene.traverse((child) => {
			if (child instanceof THREE.Mesh && child.material) {
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];
				materials.forEach((mat) => {
					if (
						mat instanceof THREE.MeshStandardMaterial ||
						mat instanceof THREE.MeshPhysicalMaterial
					) {
						const color = mat.color;
						if (color.r > 0.6 && color.g < 0.5 && color.b > 0.4) {
							mat.color.setHex(0x6633aa);
						}
						if (
							color.r > 0.8 &&
							color.g > 0.4 &&
							color.g < 0.7 &&
							color.b > 0.6
						) {
							mat.color.setHex(0x8866cc);
						}
					}
				});
			}
		});
	}, [scene]);

	useEffect(() => {
		if (actions && actions['Action']) {
			actions['Action'].reset();
			actions['Action'].setLoop(THREE.LoopRepeat, Infinity);
			actions['Action'].timeScale = 0.8;
			actions['Action'].play();
		}
	}, [actions]);

	useFrame(() => {
		if (groupRef.current) {
			const floatOffset = Math.sin(Date.now() * 0.0015) * 0.08;
			groupRef.current.position.y = position[1] + floatOffset;
		}
	});

	const handleClick = useCallback(
		(e: { stopPropagation: () => void; point: THREE.Vector3 }) => {
			e.stopPropagation();

			const clickY = e.point.y;
			const normalizedY = (clickY + 2) / 4;

			let closestKp = characterKeyPoints[0];
			let closestDist = Infinity;

			for (const kp of characterKeyPoints) {
				const dist = Math.abs(normalizedY - (1 - kp.y));
				if (dist < closestDist) {
					closestDist = dist;
					closestKp = kp;
				}
			}

			onKeyPointClick(closestKp);
		},
		[onKeyPointClick],
	);

	const footParticles = [
		{ delay: 0, offset: [-0.15, 0, 0.1] as [number, number, number] },
		{ delay: 0.3, offset: [0.15, 0, 0.1] as [number, number, number] },
		{ delay: 0.6, offset: [0, 0, -0.1] as [number, number, number] },
		{ delay: 0.9, offset: [-0.1, 0, 0] as [number, number, number] },
		{ delay: 1.2, offset: [0.1, 0, 0] as [number, number, number] },
		{ delay: 0.15, offset: [-0.2, 0, 0.05] as [number, number, number] },
		{ delay: 0.45, offset: [0.2, 0, 0.05] as [number, number, number] },
		{ delay: 0.75, offset: [0, 0, 0.15] as [number, number, number] },
	];

	const runePositions: [number, number, number][] = magicalRunes.map(
		(_, index) => {
			const totalRunes = magicalRunes.length;
			const startAngle = -Math.PI / 3;
			const endAngle = Math.PI / 3;
			const angle =
				startAngle +
				(index / (totalRunes - 1)) * (endAngle - startAngle);
			const radius = 1.8;
			const x = Math.sin(angle) * radius;
			const y = 3.2 + Math.cos(angle) * 0.5;
			const z = 0.8 + Math.cos(angle) * 0.3;
			return [x, y, z];
		},
	);

	const handleRuneClick = useCallback(
		(rune: MagicalRune) => {
			setActiveRuneId(rune.id === activeRuneId ? null : rune.id);
			onRuneClick(rune);
		},
		[onRuneClick, activeRuneId],
	);

	return (
		<group
			ref={groupRef}
			position={position}
			scale={1.2}
			rotation={[0, 0.3, 0]}
			onClick={handleClick}
			onPointerOver={() => {
				setHovered(true);
				document.body.style.cursor = 'pointer';
			}}
			onPointerOut={() => {
				setHovered(false);
				document.body.style.cursor = 'auto';
			}}>
			<primitive object={scene} />

			<group position={[0, 0.1, 0]}>
				{footParticles.map((particle, i) => (
					<FloatingParticle
						key={i}
						delay={particle.delay}
						offset={particle.offset}
					/>
				))}

				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
					<ringGeometry args={[0.2, 0.35, 32]} />
					<meshBasicMaterial
						color="#9966ff"
						transparent
						opacity={0.4}
						side={THREE.DoubleSide}
					/>
				</mesh>

				<pointLight
					position={[0, 0.2, 0]}
					color="#aa88ff"
					intensity={1.5}
					distance={2}
					decay={2}
				/>
			</group>

			{magicalRunes.map((rune, index) => (
				<MagicalRuneIcon
					key={rune.id}
					rune={rune}
					position={runePositions[index]}
					index={index}
					onClick={() => handleRuneClick(rune)}
					isActive={activeRuneId === rune.id}
				/>
			))}

			{hovered && (
				<>
					<pointLight
						position={[0, 2, 0.5]}
						color="#9966ff"
						intensity={2}
						distance={3}
						decay={2}
					/>
					<mesh position={[0, 2, 0]}>
						<sphereGeometry args={[1.5, 16, 16]} />
						<meshBasicMaterial
							color="#8855ff"
							transparent
							opacity={0.1}
							side={THREE.BackSide}
						/>
					</mesh>
				</>
			)}
		</group>
	);
}

function SceneContent({
	onBookshelfClick,
	onKeyPointClick,
	onRuneClick,
	isMobile,
}: {
	onBookshelfClick: (side: 'left' | 'right', skillIndex?: number) => void;
	onKeyPointClick: (kp: CharacterKeyPoint) => void;
	onRuneClick: (rune: MagicalRune) => void;
	isMobile: boolean;
}) {
	const { viewport } = useThree();

	const bookshelfX = Math.min(viewport.width * 0.35, 5);
	const bookshelfScale = 0.03;
	const witchX = isMobile ? 0 : 1.5;

	return (
		<>
			<ambientLight intensity={1.5} />
			<directionalLight
				position={[5, 10, 5]}
				intensity={1.5}
				castShadow
			/>
			<directionalLight position={[-5, 5, 5]} intensity={1} />
			<directionalLight position={[0, 5, 10]} intensity={1.2} />
			<pointLight position={[0, 2, 3]} intensity={2} color="#ffeecc" />
			<pointLight
				position={[-2, 1, 2]}
				intensity={1}
				color="#9966ff"
				distance={5}
			/>

			<WitchCharacter
				onKeyPointClick={onKeyPointClick}
				onRuneClick={onRuneClick}
				position={[witchX, -2, 0]}
			/>

			{!isMobile && (
				<Bookshelf
					position={[-bookshelfX, -3.5, 0]}
					rotation={[0, -90, 0]}
					scale={bookshelfScale}
					onClick={(skillIndex) =>
						onBookshelfClick('left', skillIndex)
					}
					side="left"
					skills={hardSkills}
				/>
			)}
		</>
	);
}

function LoadingFallback() {
	return (
		<Html center>
			<div
				style={{
					color: 'white',
					fontSize: '1rem',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: '1rem',
				}}>
				<div
					style={{
						width: '40px',
						height: '40px',
						border: '3px solid rgba(255,255,255,0.3)',
						borderTopColor: '#60a5fa',
						borderRadius: '50%',
						animation: 'spin 1s linear infinite',
					}}
				/>
				<span>Loading...</span>
			</div>
		</Html>
	);
}

const UNSPLASH_BACKGROUNDS = [
	'1550785517-174dec37f3d1',
	'1628614630358-120707276a4b',
	'1507842217343-583bb7270b66',
	'1481627834876-b7833e8f5570',
	'1524995997946-a1c2e315a42f',
];

function getUnsplashUrl(id: string, width = 1920): string {
	return `https://images.unsplash.com/photo-${id}?q=80&w=${width}`;
}

export default function ReactJayYuki({ width, height }: ReactJayYukiProps) {
	const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
	const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
	const [dialogue, setDialogue] = useState<string | null>(null);
	const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
	const [selectedShelfSide, setSelectedShelfSide] = useState<
		'left' | 'right'
	>('left');
	const [showPoemModal, setShowPoemModal] = useState(false);
	const [isMobile, setIsMobile] = useState(
		typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
	);

	const [currentBgIndex, setCurrentBgIndex] = useState(0);
	const [nextBgIndex, setNextBgIndex] = useState<number | null>(null);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const transitionCount = useRef(0);

	const triggerBackgroundTransition = useCallback(() => {
		if (isTransitioning) return;

		const nextIndex = (currentBgIndex + 1) % UNSPLASH_BACKGROUNDS.length;
		setNextBgIndex(nextIndex);
		setIsTransitioning(true);
		transitionCount.current += 1;

		setTimeout(() => {
			setCurrentBgIndex(nextIndex);
			setNextBgIndex(null);
			setIsTransitioning(false);
		}, 2000);
	}, [currentBgIndex, isTransitioning]);

	const handleBookshelfClick = useCallback(
		(side: 'left' | 'right', skillIndex?: number) => {
			const skills = side === 'left' ? hardSkills : softSkills;
			if (skillIndex !== undefined && skills[skillIndex]) {
				triggerBackgroundTransition();

				setSelectedSkill(skills[skillIndex]);
				setSelectedShelfSide(side);
				setLeftDrawerOpen(false);
				setRightDrawerOpen(false);
				setDialogue(null);
			} else {
				if (side === 'left') {
					setLeftDrawerOpen(true);
					setRightDrawerOpen(false);
				} else {
					setRightDrawerOpen(true);
					setLeftDrawerOpen(false);
				}
				setDialogue(null);
			}
		},
		[triggerBackgroundTransition],
	);

	const handleKeyPointClick = useCallback((keyPoint: CharacterKeyPoint) => {
		setDialogue(keyPoint.dialogue);
		setLeftDrawerOpen(false);
		setRightDrawerOpen(false);
	}, []);

	const handleRuneClick = useCallback((rune: MagicalRune) => {
		setDialogue(rune.dialogue);
		setLeftDrawerOpen(false);
		setRightDrawerOpen(false);
	}, []);

	useState(() => {
		if (typeof window === 'undefined') return;

		const handleResize = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	const containerStyles: React.CSSProperties = {
		position: 'fixed',
		top: 0,
		left: 0,
		width: width || '100vw',
		height: height || '100vh',
		overflow: 'hidden',
	};

	const backgroundStyles: React.CSSProperties = {
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		backgroundImage: `url(${getUnsplashUrl(UNSPLASH_BACKGROUNDS[currentBgIndex])})`,
		backgroundSize: 'cover',
		backgroundPosition: 'center',
		zIndex: 0,
		transition: 'opacity 2s ease-in-out',
		opacity: isTransitioning ? 0 : 1,
	};

	const nextBackgroundStyles: React.CSSProperties = {
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		backgroundImage:
			nextBgIndex !== null
				? `url(${getUnsplashUrl(UNSPLASH_BACKGROUNDS[nextBgIndex])})`
				: 'none',
		backgroundSize: 'cover',
		backgroundPosition: 'center',
		zIndex: 0,
		opacity: isTransitioning ? 1 : 0,
		transition: 'opacity 2s ease-in-out',
	};

	const magicalOverlayStyles: React.CSSProperties = {
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		background: `
			radial-gradient(ellipse at 30% 20%, rgba(255, 215, 180, 0.08) 0%, transparent 50%),
			radial-gradient(ellipse at 70% 80%, rgba(147, 112, 219, 0.06) 0%, transparent 40%),
			radial-gradient(ellipse at center, rgba(75, 50, 100, 0.1) 0%, rgba(25, 20, 40, 0.35) 60%, rgba(15, 10, 25, 0.5) 100%)
		`,
		zIndex: 1,
		pointerEvents: 'none',
		transition: 'opacity 0.5s ease',
	};

	return (
		<>
			<style>
				{`
					@keyframes fadeSlideUp {
						from {
							opacity: 0;
							transform: translateX(-50%) translateY(20px);
						}
						to {
							opacity: 1;
							transform: translateX(-50%) translateY(0);
						}
					}
					@keyframes spin {
						to { transform: rotate(360deg); }
					}
					@keyframes sparkle {
						0%, 100% { opacity: 0; transform: scale(0.3); }
						50% { opacity: 1; transform: scale(1); }
					}
					@keyframes sparkle-slow {
						0%, 100% { opacity: 0.2; transform: scale(0.5); }
						50% { opacity: 0.8; transform: scale(1.2); }
					}
					@keyframes float {
						0%, 100% { transform: translateY(0) translateX(0); }
						25% { transform: translateY(-15px) translateX(8px); }
						50% { transform: translateY(-8px) translateX(-4px); }
						75% { transform: translateY(-20px) translateX(4px); }
					}
					@keyframes float-slow {
						0%, 100% { transform: translateY(0) translateX(0) rotate(0deg); }
						33% { transform: translateY(-25px) translateX(15px) rotate(120deg); }
						66% { transform: translateY(-12px) translateX(-10px) rotate(240deg); }
					}
					@keyframes shimmer {
						0% { background-position: -200% center; }
						100% { background-position: 200% center; }
					}
					@keyframes shimmer-vertical {
						0% { background-position: center -200%; }
						100% { background-position: center 200%; }
					}
					@keyframes shimmer-diagonal {
						0% { background-position: -200% -200%; }
						100% { background-position: 200% 200%; }
					}
					@keyframes pulse-glow {
						0%, 100% { opacity: 0.3; filter: blur(20px); }
						50% { opacity: 0.6; filter: blur(30px); }
					}
					@keyframes spell-circle {
						0% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 1; }
						50% { transform: translate(-50%, -50%) scale(2) rotate(180deg); opacity: 0.8; }
						100% { transform: translate(-50%, -50%) scale(4) rotate(360deg); opacity: 0; }
					}
					@keyframes rune-float {
						0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
						20% { opacity: 1; transform: translateY(-30px) scale(1); }
						80% { opacity: 1; transform: translateY(-60px) scale(1); }
						100% { opacity: 0; transform: translateY(-80px) scale(0.5); }
					}
					.magical-particle {
						position: absolute;
						background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(200, 180, 255, 0.5) 40%, transparent 70%);
						border-radius: 50%;
						pointer-events: none;
						animation: sparkle 4s ease-in-out infinite, float 12s ease-in-out infinite;
						box-shadow: 0 0 8px rgba(180, 160, 220, 0.6), 0 0 15px rgba(255, 220, 180, 0.3);
					}
					.magical-particle-large {
						position: absolute;
						background: radial-gradient(circle, rgba(255, 250, 240, 0.7) 0%, rgba(180, 160, 220, 0.3) 50%, transparent 80%);
						border-radius: 50%;
						pointer-events: none;
						animation: sparkle-slow 6s ease-in-out infinite, float-slow 20s ease-in-out infinite;
						box-shadow: 0 0 15px rgba(200, 180, 255, 0.4), 0 0 30px rgba(255, 200, 150, 0.2);
					}
					.shimmer-overlay {
						position: absolute;
						top: 0;
						left: 0;
						width: 100%;
						height: 100%;
						background: linear-gradient(
							90deg,
							transparent 0%,
							rgba(255, 250, 245, 0.015) 20%,
							rgba(200, 180, 220, 0.04) 50%,
							rgba(255, 250, 245, 0.015) 80%,
							transparent 100%
						);
						background-size: 200% 100%;
						animation: shimmer 12s linear infinite;
						pointer-events: none;
						z-index: 2;
					}
					.shimmer-overlay-2 {
						position: absolute;
						top: 0;
						left: 0;
						width: 100%;
						height: 100%;
						background: linear-gradient(
							180deg,
							transparent 0%,
							rgba(255, 220, 180, 0.02) 30%,
							rgba(180, 160, 220, 0.03) 50%,
							rgba(255, 220, 180, 0.02) 70%,
							transparent 100%
						);
						background-size: 100% 200%;
						animation: shimmer-vertical 15s linear infinite;
						pointer-events: none;
						z-index: 2;
					}
					.shimmer-overlay-3 {
						position: absolute;
						top: 0;
						left: 0;
						width: 100%;
						height: 100%;
						background: linear-gradient(
							135deg,
							transparent 0%,
							rgba(255, 255, 255, 0.01) 40%,
							rgba(180, 140, 200, 0.025) 50%,
							rgba(255, 255, 255, 0.01) 60%,
							transparent 100%
						);
						background-size: 200% 200%;
						animation: shimmer-diagonal 18s linear infinite;
						pointer-events: none;
						z-index: 2;
					}
					.ambient-glow {
						position: absolute;
						border-radius: 50%;
						pointer-events: none;
						animation: pulse-glow 8s ease-in-out infinite;
					}
					.spell-portal {
						position: absolute;
						top: 50%;
						left: 50%;
						width: 300px;
						height: 300px;
						border: 3px solid rgba(180, 140, 255, 0.6);
						border-radius: 50%;
						pointer-events: none;
						z-index: 10;
						animation: spell-circle 2s ease-out forwards;
						box-shadow:
							0 0 30px rgba(180, 140, 255, 0.4),
							0 0 60px rgba(255, 200, 150, 0.2),
							inset 0 0 30px rgba(180, 140, 255, 0.3);
					}
					.spell-rune {
						position: absolute;
						font-size: 1.5rem;
						color: rgba(200, 180, 255, 0.8);
						pointer-events: none;
						z-index: 11;
						animation: rune-float 2s ease-out forwards;
						text-shadow: 0 0 10px rgba(180, 140, 255, 0.8);
					}
				`}
			</style>
			<div style={containerStyles}>
				<div style={nextBackgroundStyles} />

				<div style={backgroundStyles} />

				<div style={magicalOverlayStyles} />

				<div className="shimmer-overlay" />
				<div className="shimmer-overlay-2" />
				<div className="shimmer-overlay-3" />

				<div
					className="ambient-glow"
					style={{
						top: '20%',
						left: '15%',
						width: '200px',
						height: '200px',
						background:
							'radial-gradient(circle, rgba(255, 200, 150, 0.15) 0%, transparent 70%)',
						animationDelay: '0s',
					}}
				/>
				<div
					className="ambient-glow"
					style={{
						top: '60%',
						right: '10%',
						width: '250px',
						height: '250px',
						background:
							'radial-gradient(circle, rgba(180, 160, 220, 0.12) 0%, transparent 70%)',
						animationDelay: '3s',
					}}
				/>
				<div
					className="ambient-glow"
					style={{
						bottom: '15%',
						left: '40%',
						width: '180px',
						height: '180px',
						background:
							'radial-gradient(circle, rgba(200, 180, 255, 0.1) 0%, transparent 70%)',
						animationDelay: '5s',
					}}
				/>

				{[...Array(25)].map((_, i) => (
					<div
						key={`particle-${i}`}
						className="magical-particle"
						style={{
							left: `${5 + ((i * 4) % 90)}%`,
							top: `${8 + ((i * 5) % 84)}%`,
							animationDelay: `${i * 0.3}s`,
							animationDuration: `${3 + (i % 4)}s, ${10 + (i % 6)}s`,
							width: `${2 + (i % 3)}px`,
							height: `${2 + (i % 3)}px`,
						}}
					/>
				))}

				{[...Array(10)].map((_, i) => (
					<div
						key={`particle-large-${i}`}
						className="magical-particle-large"
						style={{
							left: `${10 + ((i * 9) % 80)}%`,
							top: `${12 + ((i * 11) % 76)}%`,
							animationDelay: `${i * 0.8}s`,
							animationDuration: `${5 + (i % 3)}s, ${18 + (i % 5)}s`,
							width: `${6 + (i % 4)}px`,
							height: `${6 + (i % 4)}px`,
						}}
					/>
				))}

				{isTransitioning && (
					<>
						<div
							className="spell-portal"
							key={`portal-${transitionCount.current}`}
						/>
						{['*', '+', '*', '+', '*'].map((rune, i) => (
							<div
								key={`rune-${i}-${transitionCount.current}`}
								className="spell-rune"
								style={{
									left: `${30 + i * 10}%`,
									top: '55%',
									animationDelay: `${i * 0.15}s`,
								}}>
								{rune}
							</div>
						))}
					</>
				)}

				<Canvas
					camera={{ position: [0, 0, 8], fov: 50 }}
					style={{
						background: 'transparent',
						position: 'relative',
						zIndex: 3,
					}}>
					<Suspense fallback={<LoadingFallback />}>
						<SceneContent
							onBookshelfClick={handleBookshelfClick}
							onKeyPointClick={handleKeyPointClick}
							onRuneClick={handleRuneClick}
							isMobile={isMobile}
						/>
					</Suspense>
				</Canvas>

				<SkillDrawer
					isOpen={leftDrawerOpen}
					side="left"
					skills={hardSkills}
					title="Hard Skills"
					onClose={() => setLeftDrawerOpen(false)}
				/>
				<SkillDrawer
					isOpen={rightDrawerOpen}
					side="right"
					skills={softSkills}
					title="Soft Skills"
					onClose={() => setRightDrawerOpen(false)}
				/>

				{isMobile &&
					!leftDrawerOpen &&
					!rightDrawerOpen &&
					!dialogue && (
						<MobileSkillButtons
							onLeftClick={() => setLeftDrawerOpen(true)}
							onRightClick={() => setRightDrawerOpen(true)}
						/>
					)}

				<DialogueBox
					text={dialogue || ''}
					isVisible={!!dialogue}
					onClose={() => setDialogue(null)}
				/>

				{!leftDrawerOpen &&
					!rightDrawerOpen &&
					!dialogue &&
					!selectedSkill && (
						<div
							style={{
								position: 'absolute',
								bottom: isMobile ? '5rem' : '1.5rem',
								left: '50%',
								transform: 'translateX(-50%)',
								color: '#e2e8f0',
								fontSize: '0.875rem',
								textAlign: 'center',
								pointerEvents: 'none',
							}}>
							{isMobile
								? 'Tap the witch or use buttons below!'
								: 'Click the magical runes or bookshelves to explore!'}
						</div>
					)}
			</div>

			{selectedSkill && (
				<BookModal
					skill={selectedSkill}
					onClose={() => setSelectedSkill(null)}
					shelfSide={selectedShelfSide}
				/>
			)}

			<PoemModal
				isOpen={showPoemModal}
				onClose={() => setShowPoemModal(false)}
			/>
		</>
	);
}

useGLTF.preload('/jay/bookshelf/scene.gltf');
useGLTF.preload('/jay/simplebook/scene.gltf');
useGLTF.preload('/jay/witch/scene.gltf');
useGLTF.preload('/jay/poem/scene.gltf');
useGLTF.preload('/jay/popupbook/scene.gltf');
