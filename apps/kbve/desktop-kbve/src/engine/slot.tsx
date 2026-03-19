/* eslint-disable react-hooks/refs */
import { useRef, useEffect, createElement, type CSSProperties } from 'react';

type Subscribable<S> = {
	getState: () => S;
	subscribe: (listener: (state: S, prev: S) => void) => () => void;
};

// ─── Slot ────────────────────────────────────────────────────────────────────
// Renders once via React, then patches DOM directly on store changes.
// React never re-renders this component after mount.

interface SlotProps<S, V> {
	store: Subscribable<S>;
	select: (state: S) => V;
	render: (value: V) => string;
	tag?: keyof HTMLElementTagNameMap;
	className?: string;
	style?: CSSProperties;
}

export function Slot<S, V>({
	store,
	select,
	render,
	tag: Tag = 'span' as keyof HTMLElementTagNameMap,
	className,
	style,
}: SlotProps<S, V>) {
	const ref = useRef<HTMLElement>(null);
	const selectRef = useRef(select);
	const renderRef = useRef(render);
	selectRef.current = select;
	renderRef.current = render;

	useEffect(() => {
		let prev = selectRef.current(store.getState());
		return store.subscribe((state) => {
			const next = selectRef.current(state);
			if (next !== prev) {
				prev = next;
				if (ref.current) {
					ref.current.textContent = renderRef.current(next);
				}
			}
		});
	}, [store]);

	const initial = render(select(store.getState()));

	return createElement(Tag, { ref, className, style }, initial);
}

// ─── AttrSlot ────────────────────────────────────────────────────────────────
// Patches a single DOM attribute directly on store changes.

interface AttrSlotProps<S, V> {
	store: Subscribable<S>;
	select: (state: S) => V;
	attr: string;
	render: (value: V) => string;
	tag?: keyof HTMLElementTagNameMap;
	className?: string;
	style?: CSSProperties;
	children?: React.ReactNode;
}

export function AttrSlot<S, V>({
	store,
	select,
	attr,
	render,
	tag: Tag = 'div' as keyof HTMLElementTagNameMap,
	className,
	style,
	children,
}: AttrSlotProps<S, V>) {
	const ref = useRef<HTMLElement>(null);
	const selectRef = useRef(select);
	const renderRef = useRef(render);
	selectRef.current = select;
	renderRef.current = render;

	useEffect(() => {
		let prev = selectRef.current(store.getState());
		return store.subscribe((state) => {
			const next = selectRef.current(state);
			if (next !== prev) {
				prev = next;
				if (ref.current) {
					ref.current.setAttribute(attr, renderRef.current(next));
				}
			}
		});
	}, [store, attr]);

	return createElement(Tag, { ref, className, style }, children);
}

// ─── StyleSlot ───────────────────────────────────────────────────────────────
// Patches a single CSS property directly on store changes.

interface StyleSlotProps<S, V> {
	store: Subscribable<S>;
	select: (state: S) => V;
	prop: string;
	render: (value: V) => string;
	tag?: keyof HTMLElementTagNameMap;
	className?: string;
	style?: CSSProperties;
	children?: React.ReactNode;
}

export function StyleSlot<S, V>({
	store,
	select,
	prop,
	render,
	tag: Tag = 'div' as keyof HTMLElementTagNameMap,
	className,
	style,
	children,
}: StyleSlotProps<S, V>) {
	const ref = useRef<HTMLElement>(null);
	const selectRef = useRef(select);
	const renderRef = useRef(render);
	selectRef.current = select;
	renderRef.current = render;

	useEffect(() => {
		let prev = selectRef.current(store.getState());
		return store.subscribe((state) => {
			const next = selectRef.current(state);
			if (next !== prev) {
				prev = next;
				if (ref.current) {
					ref.current.style.setProperty(
						prop,
						renderRef.current(next),
					);
				}
			}
		});
	}, [store, prop]);

	return createElement(Tag, { ref, className, style }, children);
}
