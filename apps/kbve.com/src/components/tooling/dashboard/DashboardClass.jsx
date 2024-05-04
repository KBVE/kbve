import React, { useState, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useStore } from '@nanostores/react';
import { layoutStore$, updateLayout } from '@kbve/khashvault';

const ResponsiveGridLayout = WidthProvider(Responsive);

function IconPin(props) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 16 16"
      height="1em"
      width="1em"
      {...props}
    >
      <path d="M4.146.146A.5.5 0 014.5 0h7a.5.5 0 01.5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 01-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 01-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 015 6.708V2.277a2.77 2.77 0 01-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 01.146-.354zm1.58 1.408l-.002-.001.002.001zm-.002-.001l.002.001A.5.5 0 016 2v5a.5.5 0 01-.276.447h-.002l-.012.007-.054.03a4.922 4.922 0 00-.827.58c-.318.278-.585.596-.725.936h7.792c-.14-.34-.407-.658-.725-.936a4.915 4.915 0 00-.881-.61l-.012-.006h-.002A.5.5 0 0110 7V2a.5.5 0 01.295-.458 1.775 1.775 0 00.351-.271c.08-.08.155-.17.214-.271H5.14c.06.1.133.191.214.271a1.78 1.78 0 00.37.282z" />
    </svg>
  );
}

function IconPinFill(props) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 16 16"
      height="1em"
      width="1em"
      {...props}
    >
      <path d="M4.146.146A.5.5 0 014.5 0h7a.5.5 0 01.5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 01-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 01-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 015 6.708V2.277a2.77 2.77 0 01-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 01.146-.354z" />
    </svg>
  );
}




const MyGridLayout = () => {
 //const layout = useStore(layoutStore$);
  const $layoutFromStore = useStore(layoutStore$);
  const [layout, setLayout] = useState($layoutFromStore);

  useEffect(() => {
    setLayout($layoutFromStore);
  }, [$layoutFromStore]);

  const handleLayoutChange = (newLayout) => {
    updateLayout(newLayout);
  };
  
  const togglePin = (itemId, event) => {
    event.stopPropagation();
    const newLayout = layout.map(item => {
      if (item.i === itemId) {
        return { ...item, static: !item.static };
      }
      return item;
    });
    setLayout(newLayout);
    updateLayout(newLayout); // Update the layout in the store
  };


  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={30}
      containerPadding={[10, 10]}
      verticalCompact={true}
      compactType="vertical"
      isDraggable={true}
      isResizable={true}
      autoSize={true}
      measureBeforeMount={false}
      preventCollision={false}
      onLayoutChange={handleLayoutChange}>
      {layout.map(item => (
        <div key={item.i} className={`bg-gray-200 dark:bg-gray-400 border-2 border-gray-400 p-4 shadow `} id={`block-${item.i}`}>
          Block {item.i.toUpperCase()}
          <button 
            onMouseDown={e => e.stopPropagation()} // Stop the mousedown event from propagating
            onClick={e => togglePin(item.i, e)} // Handle click, pass the event
            className={`m-1 float-right ${item.static ? 'opacity-100' : 'opacity-50'}`}
          >
            {item.static ? <IconPinFill /> : <IconPin />}
          </button>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};

export default MyGridLayout;
