import { useRef, useState, Suspense, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface JourneyPopupProps {
	isOpen: boolean;
	onClose: () => void;
}

function PopupBookModel({
	isVisible,
	onOpenComplete,
}: {
	isVisible: boolean;
	onOpenComplete?: () => void;
}) {
	const groupRef = useRef<THREE.Group>(null);
	const { scene, animations } = useGLTF('/jay/popupbook/scene.gltf');
	const mixerRef = useRef<THREE.AnimationMixer | null>(null);
	const actionRef = useRef<THREE.AnimationAction | null>(null);
	const openCompleteRef = useRef(false);
	const setupDone = useRef(false);
	const animationStarted = useRef(false);

	useEffect(() => {
		if (setupDone.current || !scene) return;
		setupDone.current = true;

		let meshCount = 0;
		scene.traverse((child) => {
			child.visible = true;
			child.frustumCulled = false;

			if (child instanceof THREE.Mesh) {
				meshCount++;
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

		if (animations && animations.length > 0) {
			const mixer = new THREE.AnimationMixer(scene);
			mixerRef.current = mixer;

			const clip =
				animations.find((a) => a.name === 'Animation') || animations[0];
			if (clip) {
				const action = mixer.clipAction(clip);
				actionRef.current = action;
			}

			const handleFinished = () => {
				if (!openCompleteRef.current) {
					openCompleteRef.current = true;
					onOpenComplete?.();
				}
			};
			mixer.addEventListener('finished', handleFinished);
		}
	}, [scene, animations, onOpenComplete]);

	useEffect(() => {
		if (!isVisible || !actionRef.current || animationStarted.current)
			return;

		animationStarted.current = true;
		openCompleteRef.current = false;

		const action = actionRef.current;
		action.reset();
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		action.timeScale = 0.5;
		action.play();
	}, [isVisible]);

	useEffect(() => {
		if (!isVisible) {
			animationStarted.current = false;
		}
	}, [isVisible]);

	useFrame((_, delta) => {
		if (mixerRef.current) {
			mixerRef.current.update(delta);
		}

		if (!groupRef.current) return;
		const targetScale = isVisible ? 2.5 : 0;
		const currentScale = groupRef.current.scale.x;
		const newScale = THREE.MathUtils.lerp(
			currentScale,
			targetScale,
			delta * 5,
		);
		groupRef.current.scale.setScalar(newScale);
	});

	return (
		<group
			ref={groupRef}
			position={[0, -1, 0]}
			rotation={[-0.4, Math.PI, 0]}
			scale={isVisible ? 2.5 : 0.01}>
			<primitive object={scene} />
		</group>
	);
}

export default function JourneyPopup({ isOpen, onClose }: JourneyPopupProps) {
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
				<Canvas camera={{ position: [0, 2.5, 3.5], fov: 45 }}>
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
						color="#aaffcc"
					/>
					<Suspense fallback={null}>
						<PopupBookModel
							isVisible={!isClosing}
							onOpenComplete={handleOpenComplete}
						/>
					</Suspense>
					<OrbitControls
						enableZoom={false}
						enablePan={false}
						minPolarAngle={Math.PI / 6}
						maxPolarAngle={Math.PI / 2.5}
						minAzimuthAngle={-Math.PI / 4}
						maxAzimuthAngle={Math.PI / 4}
						target={[0, 0, 0]}
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

useGLTF.preload('/jay/popupbook/scene.gltf');
