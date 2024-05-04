import React from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useStore } from '@nanostores/react';
import { layoutStore$, updateLayout } from '@kbve/khashvault';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MyGridLayout = () => {
  const layout = useStore(layoutStore$);

  const handleLayoutChange = (newLayout) => {
    updateLayout(newLayout);
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
        <div key={item.i} className="bg-gray-200 dark:bg-gray-400 border-2 border-gray-400 p-4 shadow" id={`block-${item.i}`}>
          Block {item.i.toUpperCase()}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};

export default MyGridLayout;
