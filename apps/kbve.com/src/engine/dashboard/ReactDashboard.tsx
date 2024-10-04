/** @jsxImportSource react */

import React, { useState } from 'react';
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

import { kilobase } from '@kbve/laser';

interface DroppableStoryProps {
  containers: string[];
}

// Draggable Item Component
const DraggableItem: React.FC<{ id: string }> = ({ id }) => {
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
const DroppableContainer: React.FC<{ id: string; children: React.ReactNode }> = ({
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
  const [items, setItems] = useState(
    containers.reduce((acc, container) => {
      acc[container] = [`${container} Item 1`, `${container} Item 2`];
      return acc;
    }, {} as Record<string, string[]>)
  );
  
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);


  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((prevItems) => {
        const activeContainer = Object.keys(prevItems).find((container) =>
          prevItems[container].includes(active.id as string)
        ) as string;

        const newContainer = over.id as string;

        if (activeContainer && newContainer && activeContainer !== newContainer) {
          return {
            ...prevItems,
            [activeContainer]: prevItems[activeContainer].filter((item) => item !== active.id),
            [newContainer]: [...prevItems[newContainer], active.id as string],
          };
        }
        return prevItems;
      });
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
              <DraggableItem key={item} id={item} />
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
  <DroppableStory containers={['A', 'B', 'C', 'D', 'E', 'F', 'G']} />
);

export default Dashboard;
