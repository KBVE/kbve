import { ReactNode, useLayoutEffect, useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  containerId?: string;
}

const Portal: React.FC<PortalProps> = memo(({ children, containerId = 'modal-root' }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // Try to find existing container
    let modalContainer = document.getElementById(containerId);
    
    // Create container if it doesn't exist
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = containerId;
      // Use Tailwind-compatible styling instead of inline styles
      modalContainer.className = 'fixed inset-0 z-[999999] pointer-events-none';
      modalContainer.style.willChange = 'contents';
      document.body.appendChild(modalContainer);
    }
    
    setContainer(modalContainer);
    
    // Cleanup function - this runs when component unmounts
    return () => {
      // Small delay to ensure any animations finish
      setTimeout(() => {
        if (modalContainer && modalContainer.children.length === 0) {
          modalContainer.classList.remove('pointer-events-auto');
          modalContainer.classList.add('pointer-events-none');
        }
      }, 100);
    };
  }, [containerId]);

  // Enable pointer events when children are present
  useEffect(() => {
    if (container) {
      if (children) {
        container.classList.remove('pointer-events-none');
        container.classList.add('pointer-events-auto');
      } else {
        container.classList.remove('pointer-events-auto');
        container.classList.add('pointer-events-none');
      }
    }
  }, [container, children]);

  // Additional cleanup when children change
  useEffect(() => {
    return () => {
      if (container) {
        // Check if container is empty and disable pointer events
        setTimeout(() => {
          if (container.children.length === 0) {
            container.classList.remove('pointer-events-auto');
            container.classList.add('pointer-events-none');
          }
        }, 300); // Wait for any exit animations
      }
    };
  }, [container]);

  return container ? createPortal(children, container) : null;
});

// Add display name for debugging
Portal.displayName = 'Portal';

export default Portal;
