import { cn } from "../../../cn";

import React, { ReactNode } from 'react';

import parse from 'html-react-parser';


export const BentoGrid = ({
    className,
    children,
  }: {
    className?: string;
    children?: React.ReactNode;
  }) => {
    return (
      <div
        className={cn(
          "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto ",
          className
        )}
      >
        {children}
      </div>
    );
  };
   
  export const BentoGridItem = ({
    className,
    title,
    description,
    slug,
    header,
    icon,
  }: {
    className?: string;
    title?: string | React.ReactNode;
    description?: string | React.ReactNode;
    slug?: string;
    
    // header?: React.ReactNode;
    // icon?: React.ReactNode;

    header?: string | React.ReactNode;
    icon?: string | React.ReactNode;
  }) => {

    const renderIcon = () => {
      if (typeof icon === 'string') {
        // If icon is a string, parse it into ReactNode
        return parse(icon);
      } else {
        // If icon is already a ReactNode, use it directly
        return icon;
      }
    };
  

    // Function to render the inner content, optionally wrapped in an <a> tag
    const renderContent = () => (
      <>
        {icon}
        <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 mb-2 mt-2">
          {title}
        </div>
        <div className="font-sans font-normal text-neutral-600 text-xs dark:text-neutral-300">
          {description}
        </div>
      </>
    );

    return (
      <div
        className={cn(
          "row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-4 dark:bg-black dark:border-white/[0.2] bg-white border border-transparent justify-between flex flex-col space-y-4",
          className
        )}
      >
              {typeof header === 'string' ? parse(header) : header}

        <div className="group-hover/bento:translate-x-2 transition duration-200">
          {/* Conditionally wrap the content with a link if slug is provided */}
          {slug ? (
            <a href={slug} className="inline-block w-full h-full">
              {renderContent()}
            </a>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    );
  };