import React, { Component } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';

const ResponsiveGridLayout = WidthProvider(Responsive);

class MyGridLayout extends Component {
  render() {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 4, h: 4 },
      { i: 'b', x: 4, y: 0, w: 4, h: 4 },
      { i: 'c', x: 8, y: 0, w: 4, h: 4 },
      { i: 'd', x: 0, y: 0, w: 4, h: 4 },
      { i: 'e', x: 4, y: 0, w: 4, h: 4 },
      { i: 'f', x: 0, y: 0, w: 4, h: 4 },
      { i: 'g', x: 4, y: 0, w: 4, h: 4 },
      { i: 'h', x: 4, y: 0, w: 4, h: 4 },
      { i: 'i', x: 0, y: 0, w: 4, h: 4 },
      { i: 'j', x: 12, y: 0, w: 4, h: 12 }
    ];

    return (
      <ResponsiveGridLayout className="layout"
                            layouts={{ lg: layout }}
                            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
                            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
                            rowHeight={30}
                            containerPadding={[10, 10]}
                            verticalCompact={true}
                            compactType="null"
                            isDraggable={true}
                            isResizable={true}
                            autoSize={true}
                            measureBeforeMount={false}
                            preventCollision={true}>
        {layout.map(item => (
          <div key={item.i} className="bg-gray-200 dark:bg-gray-400 border-2 border-gray-400 p-4 shadow" id={`block-${item.i}`}>
            Block {item.i.toUpperCase()}
          </div>
        ))}
      </ResponsiveGridLayout>
    );
  }
}

export default MyGridLayout;
