import React from "react";
import { IconProps } from "../../types";

const CollapseIcon: React.FC<IconProps> = ({
  styleClass,
  size = 32,
  color = "#000",
  onClick,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
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
        d="M11.493 8.757L8.039 5.304 5.374 7.969l3.454 3.453-2.59 2.59 7.797.004-.017-7.784-2.525 2.525zm11.679 2.665l3.454-3.453-2.665-2.665-3.454 3.453-2.525-2.525-.017 7.784 7.797-.004-2.59-2.59zM8.828 20.578l-3.454 3.453 2.665 2.665 3.454-3.453 2.526 2.525.017-7.784-7.797.004 2.589 2.59zm16.934-2.59l-7.797-.004.017 7.784 2.525-2.525 3.454 3.453 2.665-2.665-3.454-3.453 2.59-2.59z"
      ></path>
    </svg>
  );
}

export default CollapseIcon;
