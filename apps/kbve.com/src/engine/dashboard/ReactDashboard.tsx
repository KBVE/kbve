import React, { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  rectIntersection,
  DragEndEvent,
  UniqueIdentifier,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { dashboardBase } from './DashboardBase';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface DroppableStoryProps {
  containers: string[];
}

// Sidebar wrapper and container styles
const sidebarStyles = twMerge(
  'p-5 border-gray-200 dark:text-neutral-200  rounded-md',
  'w-full w-1/4', // Responsive width for sidebar: full width on small screens, 1/4 width on medium and larger screens
  'flex flex-col items-center' // Center content in the sidebar on small screens
);
const containerStyles = twMerge(
  'flex flex-wrap flex-grow bg-gray-500 p-5 rounded-md',
  'w-full md:w-3/4' // Full width on small screens, 3/4 width on medium and larger screens
);

// Draggable Item Component
const DraggableItem: React.FC<{ id: UniqueIdentifier; isDragging?: boolean }> = ({ id }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      className={twMerge(
        'p-3 border border-cyan-500 rounded-md m-2 cursor-grab bg-cyan-300 dark:text-neutral-600',
        clsx({ 'opacity-50': isDragging })
      )}
      style={style}
      {...listeners}
      {...attributes}
    >
      {id}
    </div>
  );
};

// Droppable Container Component
const DroppableContainer: React.FC<{ id: UniqueIdentifier; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={twMerge(
        'p-5 border-dashed border-2 border-gray-300 rounded-md m-3 min-h-[150px]',
        'w-full sm:w-[45%] md:w-[30%]', // Responsive width for containers: full width on small screens, narrower on larger screens
        clsx({ 'bg-cyan-100': isOver, 'bg-white': !isOver })
      )}
    >
      <h3 className={twMerge('font-bold mb-3')}>{id}</h3>
      {children}
    </div>
  );
};

// Droppable Sidebar Container Component (for returning items to the sidebar)
const DroppableSidebar: React.FC<{ id: UniqueIdentifier; children: React.ReactNode }> = ({ id, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={twMerge(
        sidebarStyles,
        'border-2 border-dashed border-gray-400',
        clsx({ 'bg-cyan-500': isOver })
      )}
    >
      <h3 className={twMerge('font-bold text-xl mb-4')}>Inventory</h3>
      {children}
    </div>
  );
};

// Sidebar Component with Initial Draggable Items
const Sidebar: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <div className={sidebarStyles}>
      <h3 className={twMerge('font-bold text-xl mb-4')}>Available Items</h3>
      {items.map((item) => (
        <DraggableItem key={item} id={item} />
      ))}
    </div>
  );
};

// Main DroppableStory Component
const DroppableStory: React.FC<DroppableStoryProps> = ({ containers }) => {
  // State to manage draggable item positions in containers
  const [items, setItems] = useState<Record<string, { id: string; container: string }[]>>({});
  // State for available sidebar items
  const [sidebarItems, setSidebarItems] = useState<string[]>(['Item 1', 'Item 2', 'Item 3', 'Function', 'IGBC']);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Configure sensors for both pointer and touch events
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  // Load initial item positions from DashboardBase when component mounts
  useEffect(() => {
    const initialPositions = dashboardBase.loadItemPositions();
    setItems(initialPositions);

    // Remove items that are already placed in containers from the sidebar
    const placedItems = new Set(
      Object.values(initialPositions).flatMap((itemList) => itemList.map((item) => item.id))
    );
    setSidebarItems((prevSidebarItems) =>
      prevSidebarItems.filter((item) => !placedItems.has(item))
    );
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
      items[container]?.some((item) => item.id === active.id)
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
            [activeContainer]: prevItems[activeContainer].filter((item) => item.id !== active.id),
          };
          dashboardBase.saveItemPositions(updatedItems);
          return updatedItems;
        });
      }
    }
    // Handle dragging items from the sidebar into a container
    else if (!activeContainer) {
      // Remove the item from the sidebar if it's being moved to a container
      setSidebarItems((prev) => prev.filter((item) => item !== active.id));

      // Add the item to the target container
      setItems((prevItems) => {
        const updatedItems = {
          ...prevItems,
          [newContainer]: [...(prevItems[newContainer] || []), { id: active.id as string, container: newContainer }],
        };
        dashboardBase.saveItemPositions(updatedItems); // Save updated positions to DashboardBase
        return updatedItems;
      });
    }
    // Handle moving items within containers
    else if (activeContainer !== newContainer) {
      const updatedItems = {
        ...items,
        [activeContainer]: items[activeContainer].filter((item) => item.id !== active.id),
        [newContainer]: [...(items[newContainer] || []), { id: active.id as string, container: newContainer }],
      };

      setItems(updatedItems);

      // Save updated positions to DashboardBase
      dashboardBase.saveItemPositions(updatedItems);
    }

    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors} // Use the configured sensors for touch support
      collisionDetection={rectIntersection}
      onDragStart={(event) => setActiveId(event.active.id)}
      onDragEnd={handleDragEnd}
    >
      <div className={twMerge('flex flex-col md:flex-row')}>
        {/* Droppable Sidebar with draggable items */}
        <DroppableSidebar id="sidebar">
          <Sidebar items={sidebarItems} />
        </DroppableSidebar>

        {/* Droppable containers */}
        <div className={containerStyles}>
          {containers.map((container) => (
            <DroppableContainer key={container} id={container}>
              {items[container]?.map((item) => (
                <DraggableItem key={item.id} id={item.id} />
              ))}
            </DroppableContainer>
          ))}
        </div>
      </div>
      {/* Overlay shown while dragging */}
      <DragOverlay>{activeId ? <div>{activeId}</div> : null}</DragOverlay>
    </DndContext>
  );
};

// Use the DroppableStory component with predefined containers
const Dashboard = () => (
  <DroppableStory containers={['Deploy', 'B', 'C', 'D', 'E', 'F', 'Kill']} />
);

export default Dashboard;
