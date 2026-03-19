import { useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';

export function ThemeSwitch() {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const applyTheme = (theme: string) => {
			const isDark = theme === 'dark';
			document.documentElement.setAttribute(
				'data-theme',
				isDark ? 'dark' : 'light',
			);
			if (inputRef.current) {
				inputRef.current.checked = !isDark;
			}
		};

		applyTheme(useSettingsStore.getState().theme);

		return useSettingsStore.subscribe((state, prev) => {
			if (state.theme !== prev.theme) {
				applyTheme(state.theme);
			}
		});
	}, []);

	const handleChange = () => {
		const current = useSettingsStore.getState().theme;
		useSettingsStore
			.getState()
			.setTheme(current === 'dark' ? 'light' : 'dark');
	};

	return (
		<label className="theme-switch">
			<input
				ref={inputRef}
				type="checkbox"
				defaultChecked={useSettingsStore.getState().theme !== 'dark'}
				onChange={handleChange}
			/>
			<span className="theme-slider">
				<div className="star star_1" />
				<div className="star star_2" />
				<div className="star star_3" />
				<svg viewBox="0 0 16 16" className="cloud cloud_1">
					<path
						transform="matrix(.77976 0 0 .78395-299.99-418.63)"
						fill="currentColor"
						d="m391.84 540.91c-.421-.329-.949-.524-1.523-.524-1.351 0-2.451 1.084-2.485 2.435-1.395.526-2.388 1.88-2.388 3.466 0 1.874 1.385 3.423 3.182 3.667v.034h12.73v-.006c1.775-.104 3.182-1.584 3.182-3.395 0-1.747-1.309-3.186-2.994-3.379.007-.106.011-.214.011-.322 0-2.707-2.271-4.901-5.072-4.901-2.073 0-3.856 1.202-4.643 2.925"
					/>
				</svg>
			</span>
		</label>
	);
}
