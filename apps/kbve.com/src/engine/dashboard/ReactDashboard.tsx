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
  };

  return (
    <div ref={setNodeRef} style={style}>
      <h3>{id}</h3>
      {children}
    </div>
  );
};

// Main DroppableStory Component
const DroppableStory: React.FC<DroppableStoryProps> = ({ containers }) => {
  // State to manage draggable item positions
  const [items, setItems] = useState<Record<string, { id: string; container: string }[]>>({});
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Load initial item positions from DashboardBase when component mounts
  useEffect(() => {
    const initialPositions = dashboardBase.loadItemPositions();
    setItems(initialPositions);
  }, []);

  // Handle drag end event
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeContainer = Object.keys(items).find((container) =>
        items[container].some((item) => item.id === active.id)
      ) as string;

      const newContainer = over.id as string;

      if (activeContainer && newContainer && activeContainer !== newContainer) {
        const updatedItems = {
          ...items,
          [activeContainer]: items[activeContainer].filter((item) => item.id !== active.id),
          [newContainer]: [...items[newContainer], { id: active.id as string, container: newContainer }],
        };

        setItems(updatedItems);

        // Save updated positions to DashboardBase
        dashboardBase.saveItemPositions(updatedItems);
      }
    }

    setActiveId(null);
  };

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragStart={(event) => setActiveId(event.active.id)}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {containers.map((container) => (
          <DroppableContainer key={container} id={container}>
            {items[container]?.map((item) => (
              <DraggableItem key={item.id} id={item.id} />
            ))}
          </DroppableContainer>
        ))}
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
