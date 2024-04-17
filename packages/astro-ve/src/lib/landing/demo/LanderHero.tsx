import React from 'react';
import Hero from './Hero';
import ExampleComponent1 from './ExampleComponent1';
import ExampleComponent2 from './ExampleComponent2';

const LanderHero: React.FC = () => {

    const componentConfigs = [
        {
          Component: ExampleComponent1,
          animation: {
            enter: {
              x: 1000,
              opacity: 0,
              scale: 0.9
            },
            center: {
              x: 0,
              opacity: 1,
              scale: 1
            },
            exit: {
              x: -1000,
              opacity: 0,
              scale: 0.9
            }
          }
        },
        {
          Component: ExampleComponent2,
          animation: {
            enter: {
              x: -1000,
              opacity: 0,
              scale: 0.9
            },
            center: {
              x: 0,
              opacity: 1,
              scale: 1
            },
            exit: {
              x: 1000,
              opacity: 0,
              scale: 0.9
            }
          }
        }
      ];
	return (
		<div className="LanderHero">
			<Hero components={componentConfigs} />
		</div>
	);
};

export default LanderHero;
