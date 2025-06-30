import { ReactNode, useLayoutEffect, useState } from 'react';
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
    
    // Make sure container has high z-index and proper positioning
    modalContainer.style.zIndex = '999999';
    modalContainer.style.position = 'fixed';
    modalContainer.style.pointerEvents = 'auto';
    
    setContainer(modalContainer);
    
    // Cleanup function
    return () => {
      if (modalContainer && modalContainer.children.length === 0) {
        modalContainer.style.pointerEvents = 'none';
      }
    };
  }, [containerId]);

  return container ? createPortal(children, container) : null;
};

export default Portal;
