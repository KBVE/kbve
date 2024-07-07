import React from 'react';

import { IconProps } from '../../types';

const ExpandIcon: React.FC<IconProps> = ({
  styleClass,
  size = 24,
  color = '#000',
  onClick,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={styleClass}
      onClick={onClick}
      {...props}
    >
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 8.5V4m0 0h4.5M4 4l5.5 5.5m10.5-1V4m0 0h-4.5M20 4l-5.5 5.5M4 15.5V20m0 0h4.5M4 20l5.5-5.5m10.5 1V20m0 0h-4.5m4.5 0l-5.5-5.5"
      ></path>
    </svg>
  );
};

export default ExpandIcon;
