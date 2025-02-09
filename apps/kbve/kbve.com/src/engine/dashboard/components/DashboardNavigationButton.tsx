import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface DashboardNavigationButtonProps {
	text: string;
	href?: string;
	onClick?: () => void;
	className?: string;
}

const DashboardNavigationButton: React.FC<DashboardNavigationButtonProps> = ({
	text,
	href,
	onClick,
	className,
}) => {

    const handleClick = () => {

        if (onClick) {
          onClick(); // Execute custom onClick handler if provided
        }
        if (href) {
          //navigate(href); // If using React Router, navigate to the href path
          // If not using React Router, use window.location.href:
          window.location.href = href;
        }
      };

      
	
	  const baseStyles = twMerge(
		"relative z-10 px-5 py-3 overflow-visible font-medium text-gray-600 bg-gray-100 border border-gray-100 rounded-lg shadow-inner group",
		"hover:text-white",
		className
	  );

  // Make sure the border animations are also visible and not clipped
  const borderStyles = clsx(
    "absolute top-0 left-0 w-0 h-0 transition-all duration-200 border-t-2 border-gray-600 group-hover:w-full ease",
    "absolute bottom-0 right-0 w-0 h-0 transition-all duration-200 border-b-2 border-gray-600 group-hover:w-full ease"
  );

	const backgroundStyles = clsx(
    "absolute top-0 left-0 w-full h-0 transition-all duration-300 delay-200 bg-gray-600 group-hover:h-full ease",
    "absolute bottom-0 left-0 w-full h-0 transition-all duration-300 delay-200 bg-gray-600 group-hover:h-full ease",
    "absolute inset-0 w-full h-full duration-300 delay-300 bg-gray-900 opacity-0 group-hover:opacity-100"
  );


	return (
    <button type="button" className={baseStyles} onClick={handleClick}>
      <span className={borderStyles} />
      <span className={backgroundStyles} />
	  <span className="relative z-20 transition-colors duration-300 delay-200 group-hover:text-white ease">

        {text}
      </span>
    </button>
  );
};

export default DashboardNavigationButton;