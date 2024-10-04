/** @jsxImportSource react */

import React, { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  rectIntersection,
  DragEndEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { dashboardBase } from './DashboardBase';

interface DroppableStoryProps {
  containers: string[];
}

// Draggable Item Component
const DraggableItem: React.FC<{ id: UniqueIdentifier }> = ({ id }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    backgroundColor: '#e3f2fd',
    padding: '10px',
    border: '1px solid #2196f3',
    borderRadius: '4px',
    margin: '5px 0',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
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

  const style = {
    backgroundColor: isOver ? '#e0f7fa' : '#f1f1f1',
    padding: '20px',
    margin: '10px',
    border: '2px dashed #ddd',
    borderRadius: '4px',
    minHeight: '100px', // Adjust to provide enough space for dropping items
  };

  return (
    <div ref={setNodeRef} style={style}>
      <h3>{id}</h3>
      {children}
    </div>
  );
};

// Sidebar Component with Initial Draggable Items
const Sidebar: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <div style={{ padding: '20px', borderRight: '1px solid #ddd' }}>
      <h3>Available Items</h3>
      {items.map((item) => (
        <DraggableItem key={item} id={item} />
      ))}
    </div>
  );
};

// Main DroppableStory Component
const DroppableStory: React.FC<DroppableStoryProps> = ({ containers }) => {
  // State to manage draggable item positions
  const [items, setItems] = useState<Record<string, { id: string; container: string }[]>>({});
  const [sidebarItems, setSidebarItems] = useState<string[]>(['Item 1', 'Item 2', 'Item 3']);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Load initial item positions from DashboardBase when component mounts
  useEffect(() => {
    const initialPositions = dashboardBase.loadItemPositions();
    setItems(initialPositions);
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

    // Handle dragging items from the sidebar into a container
    if (!activeContainer) {
      // Remove the item from the sidebar
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
      collisionDetection={rectIntersection}
      onDragStart={(event) => setActiveId(event.active.id)}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'flex' }}>
        {/* Sidebar with draggable items */}
        <Sidebar items={sidebarItems} />

        {/* Droppable containers */}
        <div style={{ display: 'flex', flexWrap: 'wrap', flexGrow: 1 }}>
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
  <DroppableStory containers={['Deploy', 'B', 'C', 'D', 'E', 'F', 'G']} />
);

export default Dashboard;
