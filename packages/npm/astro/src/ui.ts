// Lean UI subpath: pure-React overlay primitives with ZERO @kbve/droid
// dependency, so consumers (the cryptothrone embed / Discord Activity) don't
// drag the droid SharedWorker infrastructure into their bundle. The Discord
// iframe sandbox has no SharedWorkers anyway — this path is main-thread only.

export { NotContent } from './react/NotContent';
export type { NotContentProps } from './react/NotContent';
export { FloatingWindow } from './react/FloatingWindow';
export type { FloatingWindowProps, WindowLayer } from './react/FloatingWindow';
export { Drawer } from './react/Drawer';
export type { DrawerProps, DrawerSide } from './react/Drawer';
export { Popover } from './react/Popover';
export type { PopoverProps, PopoverPlacement } from './react/Popover';

export { useDraggable } from './hooks/useDraggable';
export type {
	Position,
	UseDraggableOptions,
	UseDraggableResult,
} from './hooks/useDraggable';
export { useResizable } from './hooks/useResizable';
export type {
	Size,
	UseResizableOptions,
	UseResizableResult,
} from './hooks/useResizable';

export { cn } from './utils/cn';
