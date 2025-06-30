import { ReactNode, useLayoutEffect, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  containerId?: string;
}

const Portal: React.FC<PortalProps> = ({ children, containerId = 'modal-root' }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // Try to find existing container
    let modalContainer = document.getElementById(containerId);
    
    // Create container if it doesn't exist
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = containerId;
      modalContainer.style.zIndex = '999999';
      modalContainer.style.position = 'fixed';
      modalContainer.style.top = '0';
      modalContainer.style.left = '0';
      modalContainer.style.width = '100%';
      modalContainer.style.height = '100%';
      modalContainer.style.pointerEvents = 'none';
      document.body.appendChild(modalContainer);
    }
    
    setContainer(modalContainer);
    
    // Cleanup function - this runs when component unmounts
    return () => {
      // Small delay to ensure any animations finish
      setTimeout(() => {
        if (modalContainer && modalContainer.children.length === 0) {
          modalContainer.style.pointerEvents = 'none';
        }
      }, 100);
    };
  }, [containerId]);

  // Enable pointer events when children are present
  useEffect(() => {
    if (container) {
      container.style.pointerEvents = children ? 'auto' : 'none';
    }
  }, [container, children]);

  // Additional cleanup when children change
  useEffect(() => {
    return () => {
      if (container) {
        // Check if container is empty and disable pointer events
        setTimeout(() => {
          if (container.children.length === 0) {
            container.style.pointerEvents = 'none';
          }
        }, 300); // Wait for any exit animations
      }
    };
  }, [container]);

  return container ? createPortal(children, container) : null;
};

export default Portal;
