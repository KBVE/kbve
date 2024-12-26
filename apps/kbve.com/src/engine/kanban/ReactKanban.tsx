import React, { useEffect, useState } from 'react';
import {
	DndContext,
	DragOverlay,
	useDraggable,
	useDroppable,
	rectIntersection,
	type DragEndEvent,
	type UniqueIdentifier,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';

import { clsx } from 'clsx';
import { useStore } from '@nanostores/react';
import { twMerge } from 'tailwind-merge';

import { kanbanBase } from './KanbanBase';

import { CSS } from '@dnd-kit/utilities';

import { ExpandIcon } from '@kbve/laser';
import {
	eventEmitterInstance,
	type OpenModalEventData,
	type NPCInteractionEventData,
} from '@kbve/laser';

interface DroppableStoryProps {
	containers: string[];
	items: Record<string, { id: string; container: string }[]>;
	sidebarItems: string[];
	setItems: React.Dispatch<
		React.SetStateAction<
			Record<string, { id: string; container: string }[]>
		>
	>;
	setSidebarItems: React.Dispatch<React.SetStateAction<string[]>>;
}

// Sidebar wrapper and container styles
const sidebarStyles = twMerge(
	'p-5 border-gray-200 dark:text-neutral-200 rounded-md',
	'w-full md:w-1/4',
	'flex flex-col items-center',
);
const containerStyles = twMerge(
	'flex flex-wrap flex-grow bg-gray-500 p-5 rounded-md',
	'w-full md:w-3/4',
);

// Modal Component
const Modal: React.FC<{
	title: string;
	message: string;
	isVisible: boolean;
	onClose: () => void;
}> = ({ title, message, isVisible, onClose }) => {
	if (!isVisible) return null;

	return (
		<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
			<div className="bg-white p-5 rounded shadow-lg w-96">
				<h2 className="text-xl font-bold mb-4">{title}</h2>
				<p className="mb-4">
					This is the content of the modal for item {title}.{message}
				</p>
				<button
					className="bg-cyan-500 text-gray-500 py-2 px-4 rounded hover:bg-cyan-600"
					onClick={onClose}>
					Close
				</button>
			</div>
		</div>
	);
};

// Draggable Item Component with ExpandIcon for triggering modal
const DraggableItem: React.FC<{
	id: UniqueIdentifier;
	isDragging?: boolean;
	onExpandClick?: () => void;
}> = ({ id, onExpandClick }) => {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id,
		});

	const style = {
		transform: CSS.Translate.toString(transform),
	};

	return (
		<div
			ref={setNodeRef}
			className={twMerge(
				'p-3 border border-cyan-500 rounded-md m-2 cursor-grab bg-cyan-300 dark:text-neutral-600 flex items-center justify-between',
				clsx({ 'opacity-50': isDragging }),
			)}
			style={style}
			{...listeners}
			{...attributes}>
			{id}
			{/* Expand Icon button to trigger modal */}
			<button
				onClick={onExpandClick}
				className="ml-2 p-2 rounded-full bg-gray-200 hover:bg-gray-300">
				<ExpandIcon className="w-4 h-4 text-gray-800 dark:text-gray-200" />
			</button>
		</div>
	);
};

// Droppable Container Component
const DroppableContainer: React.FC<{
	id: UniqueIdentifier;
	children: React.ReactNode;
}> = ({ id, children }) => {
	const { setNodeRef, isOver } = useDroppable({
		id,
	});

	return (
		<div
			ref={setNodeRef}
			className={twMerge(
				'p-5 border-dashed border-2 border-gray-300 rounded-md m-3 min-h-[150px]',
				'w-full sm:w-[45%] md:w-[30%]',
				clsx({ 'bg-cyan-100': isOver, 'bg-white': !isOver }),
			)}>
			<h3 className={twMerge('font-bold mb-3')}>{id}</h3>
			{children}
		</div>
	);
};

// Droppable Sidebar Container Component (for returning items to the sidebar)
const DroppableSidebar: React.FC<{
	id: UniqueIdentifier;
	children: React.ReactNode;
}> = ({ id, children }) => {
	const { setNodeRef, isOver } = useDroppable({
		id,
	});

	//const $profile$ = useStore($profileStore);

	return (
		<div
			ref={setNodeRef}
			className={twMerge(
				sidebarStyles,
				'border-2 border-dashed border-gray-400',
				clsx({ 'bg-cyan-500': isOver }),
			)}>
			<h3 className={twMerge('font-bold text-xl mb-4')}>{`Kanban`}</h3>
			{children}
		</div>
	);
};

// Sidebar Component with Initial Draggable Items
const Sidebar: React.FC<{
	items: string[];
	onItemExpandClick: (id: string) => void;
}> = ({ items, onItemExpandClick }) => {
	return (
		<div className={sidebarStyles}>
			<h3 className={twMerge('font-bold text-xl mb-4')}>
				Available Items
			</h3>
			{items.map((item) => (
				<DraggableItem
					key={item}
					id={item}
					onExpandClick={() => onItemExpandClick(item)}
				/>
			))}
		</div>
	);
};

// Main DroppableStory Component
const DroppableStory: React.FC<DroppableStoryProps> = ({ containers }) => {
	// State to manage draggable item positions in containers
	const [items, setItems] = useState<
		Record<string, { id: string; container: string }[]>
	>({});
	// State for available sidebar items
	const [sidebarItems, setSidebarItems] = useState<string[]>([
		'Item 1',
		'Item 2',
		'Item 3',
		'Function',
		'IGBC',
	]);
	const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
	const [isModalVisible, setModalVisible] = useState(false);
	const [modalTitle, setModalTitle] = useState('');
	const [modalMessage, setModalMessage] = useState('');

	// Reset
	const resetKanban = () => {
		// Define the reset template for containers
		const resetTemplate = {
			TODO: [],
			'IN-PROGRESS': [],
			DONE: [],
		};

		// Load the current positions to find all items
		const currentPositions = kanbanBase.loadItemPositions();

		// Collect all item IDs currently in containers
		const allItemIds = Object.values(currentPositions).flatMap((items) =>
			items.map((item) => item.id),
		);

		// Move items back to the sidebar if not already present
		setSidebarItems((prevSidebarItems) => {
			const uniqueItems = [
				...new Set([...prevSidebarItems, ...allItemIds]),
			];
			return uniqueItems;
		});

		// Reset the item positions in KanbanBase
		kanbanBase.resetItemPositions(resetTemplate);

		// Clear the state of items in containers
		setItems(resetTemplate);

		console.log('Kanban reset completed.');
	};

	// Configure sensors for both pointer and touch events
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 100, tolerance: 5 },
		}),
	);

	useEffect(() => {
		const loadProfileAndItems = async () => {
			try {
				// Load profile data
				const profileData = await kanbanBase.loadProfile();
				console.log(`Data: ${profileData}`);
			} catch (error) {
				console.error(
					'Error loading profile or item positions:',
					error,
				);
			}
		};

		loadProfileAndItems(); // Call the async function to load profile and items
	}, []);

	// Load initial item positions from DashboardBase when component mounts
	useEffect(() => {
		const initialPositions = kanbanBase.loadItemPositions();
		setItems(initialPositions);

		// Remove items that are already placed in containers from the sidebar
		const placedItems = new Set(
			Object.values(initialPositions).flatMap((itemList) =>
				itemList.map((item) => item.id),
			),
		);
		setSidebarItems((prevSidebarItems) =>
			prevSidebarItems.filter((item) => !placedItems.has(item)),
		);
	}, []);

	// Open modal with item details
	const handleItemExpandClick = (id: string) => {
		eventEmitterInstance.emit('openModal', { message: `Modal for ${id}` });
	};

	// Listen for modal open events
	useEffect(() => {
		const handleOpenModal = (data?: OpenModalEventData) => {
			if (data) setModalTitle(data.message);
			setModalVisible(true);
		};

		eventEmitterInstance.on('openModal', handleOpenModal);
		return () => {
			eventEmitterInstance.off('openModal', handleOpenModal);
		};
	}, []);

	// Listen for handleNpcInteraction
	useEffect(() => {
		const handleNpcInteraction = (data?: NPCInteractionEventData) => {
			if (data) {
				switch (data.npcId) {
					case 'Reset':
						resetKanban();

					default:
						break;
				}
			}
		};

		eventEmitterInstance.on('npcInteraction', handleNpcInteraction);
		return () => {
			eventEmitterInstance.off('npcInteraction', handleNpcInteraction);
		};
	}, []);

	// Handle drag end event
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		// If there is no `over` or the item is being dragged back to the sidebar
		if (!over) {
			setActiveId(null);
			return;
		}

		const activeContainer = Object.keys(items).find((container) =>
			items[container]?.some((item) => item.id === active.id),
		) as string;

		const newContainer = over.id as string;

		// Check if item is dropped in the sidebar drop zone
		if (newContainer === 'sidebar') {
			// Move item back to the sidebar only if it's not already there
			if (!sidebarItems.includes(active.id as string)) {
				setSidebarItems((prev) => [...prev, active.id as string]);
			}

			// Remove item from its container if it was in a container
			if (activeContainer) {
				setItems((prevItems) => {
					const updatedItems = {
						...prevItems,
						[activeContainer]: prevItems[activeContainer].filter(
							(item) => item.id !== active.id,
						),
					};
					kanbanBase.saveItemPositions(updatedItems);
					return updatedItems;
				});
			}
		}
		// Handle dragging items from the sidebar into a container
		else if (!activeContainer) {
			// Remove the item from the sidebar if it's being moved to a container
			setSidebarItems((prev) =>
				prev.filter((item) => item !== active.id),
			);

			// Add the item to the target container
			setItems((prevItems) => {
				const updatedItems = {
					...prevItems,
					[newContainer]: [
						...(prevItems[newContainer] || []),
						{ id: active.id as string, container: newContainer },
					],
				};
				kanbanBase.saveItemPositions(updatedItems); // Save updated positions to DashboardBase
				return updatedItems;
			});
		}
		// Handle moving items within containers
		else if (activeContainer !== newContainer) {
			const updatedItems = {
				...items,
				[activeContainer]: items[activeContainer].filter(
					(item) => item.id !== active.id,
				),
				[newContainer]: [
					...(items[newContainer] || []),
					{ id: active.id as string, container: newContainer },
				],
			};

			setItems(updatedItems);

			// Save updated positions to DashboardBase
			kanbanBase.saveItemPositions(updatedItems);
		}

		setActiveId(null);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={rectIntersection}
			onDragStart={(event) => setActiveId(event.active.id)}
			onDragEnd={handleDragEnd}>
			<div className={twMerge('flex flex-col md:flex-row')}>
				{/* Droppable Sidebar with draggable items */}
				<DroppableSidebar id="sidebar">
					<Sidebar
						items={sidebarItems}
						onItemExpandClick={handleItemExpandClick}
					/>
				</DroppableSidebar>

				{/* Droppable containers */}
				<div className={containerStyles}>
					{containers.map((container) => (
						<DroppableContainer key={container} id={container}>
							{items[container]?.map((item) => (
								<DraggableItem
									key={item.id}
									id={item.id}
									onExpandClick={() =>
										handleItemExpandClick(item.id)
									}
								/>
							))}
						</DroppableContainer>
					))}
				</div>
			</div>

			{/* Overlay shown while dragging */}
			<DragOverlay>{activeId ? <div>{activeId}</div> : null}</DragOverlay>

			{/* Modal for Item Details */}
			<Modal
				title={modalTitle}
				message={modalMessage}
				isVisible={isModalVisible}
				onClose={() => setModalVisible(false)}
			/>
		</DndContext>
	);
};

//	TODO: API Changes - Having the ability to load and save board data to the API Server

const BoardForm: React.FC<{ onSubmit: (boardId: string) => void }> = ({
	onSubmit,
}) => {
	const [boardId, setBoardId] = useState('');

	return (
		<div className="flex flex-col items-center justify-center h-screen bg-gray-100">
			<h2 className="text-2xl font-bold mb-4">Enter Board ID</h2>
			<input
				type="text"
				placeholder="Board ID"
				value={boardId}
				onChange={(e) => setBoardId(e.target.value)}
				className="border p-2 rounded-md mb-4 w-64"
			/>
			<button
				onClick={() => boardId && onSubmit(boardId)}
				className="bg-cyan-500 text-white py-2 px-4 rounded hover:bg-cyan-600">
				Submit
			</button>
		</div>
	);
};

// Use the DroppableStory component with predefined containers
// const ReactKanban = () => (
// 	<DroppableStory containers={['TODO', 'IN-PROGRESS', 'DONE']} />
// );
const ReactKanban: React.FC = () => {
    const [boardId, setBoardId] = useState<string | null>(null);
    const [items, setItems] = useState<Record<string, { id: string; container: string }[]>>({});
    const [sidebarItems, setSidebarItems] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Load board data by boardId and update state.
     * @param id - The boardId to load data for.
     */
    const loadBoardData = async (id: string) => {
        setIsLoading(true);
        try {
            // Fetch board data from the API or local storage
            const boardData = await kanbanBase.loadBoardData(id);

            if (boardData) {
                setItems(boardData);

                // Extract item IDs already placed in containers
                const placedItems = new Set(
                    Object.values(boardData).flatMap((container) =>
                        container.map((item) => item.id)
                    )
                );

                // Update sidebar with items not in containers
                setSidebarItems((prev) =>
                    prev.filter((item) => !placedItems.has(item))
                );
            } else {
                alert('No board data found for the provided Board ID.');
                setBoardId(null);
            }
        } catch (error) {
            console.error('Error loading board data:', error);
            alert('Failed to load board data.');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Save the current board data to the API.
     */
    const saveBoardData = async () => {
        if (!boardId) return;

        try {
            await kanbanBase.saveBoardData(boardId, items);
            alert('Board saved successfully!');
        } catch (error) {
            console.error('Error saving board data:', error);
            alert('Failed to save board.');
        }
    };

    /**
     * Reset the Kanban board to the initial state.
     */
    const resetBoard = () => {
        const resetTemplate = { TODO: [], 'IN-PROGRESS': [], DONE: [] };
        setItems(resetTemplate);

        // Move all items back to the sidebar
        const allItems = Object.values(items)
            .flatMap((container) => container.map((item) => item.id))
            .filter((id) => !sidebarItems.includes(id));

        setSidebarItems((prev) => [...prev, ...allItems]);
    };

    /**
     * Handle the submission of a new board ID.
     * @param id - The boardId to set and load.
     */
    const handleBoardIdSubmit = (id: string) => {
        setBoardId(id);
        loadBoardData(id);
    };

    // Fetch data whenever `boardId` is set
    useEffect(() => {
        if (boardId) {
            loadBoardData(boardId);
        }
    }, [boardId]);

    // Render loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                Loading...
            </div>
        );
    }

    // Render the board form if no board ID is set
    if (!boardId) {
        return <BoardForm onSubmit={handleBoardIdSubmit} />;
    }

    // Render the Kanban board
    return (
        <div>
            <DroppableStory
                containers={['TODO', 'IN-PROGRESS', 'DONE']}
                items={items}
                sidebarItems={sidebarItems}
                setItems={setItems}
                setSidebarItems={setSidebarItems}
            />
            <div className="mt-4 text-center">
                <button
                    className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600"
                    onClick={saveBoardData}
                >
                    Save Board
                </button>
                <button
                    className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 ml-4"
                    onClick={resetBoard}
                >
                    Reset Board
                </button>
            </div>
        </div>
    );
};

export default ReactKanban;
