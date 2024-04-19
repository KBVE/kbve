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
              transform: 'perspective(600px) rotateY(90deg) rotateX(0deg) translateZ(0px)',
              opacity: 0,
              scale: 0.9
            },
            center: {
              transform: 'perspective(600px) rotateY(0deg) rotateX(0deg) translateZ(0px)',
              opacity: 1,
              scale: 1
            },
            exit: {
              transform: 'perspective(600px) rotateY(-90deg) rotateX(0deg) translateZ(0px)',
              opacity: 0,
              scale: 0.9
            }
          }
        },
        {
          Component: ExampleComponent2,
          animation: {
            enter: {
              transform: 'perspective(600px) rotateX(90deg) rotateY(0deg) translateZ(0px)',
              opacity: 0,
              scale: 0.9
            },
            center: {
              transform: 'perspective(600px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
              opacity: 1,
              scale: 1
            },
            exit: {
              transform: 'perspective(600px) rotateX(-90deg) rotateY(0deg) translateZ(0px)',
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
