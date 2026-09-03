import { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
	text: string;
	speed?: number;
	onComplete?: () => void;
}

export function TypewriterText({
	text,
	speed = 30,
	onComplete,
}: TypewriterTextProps) {
	const [displayed, setDisplayed] = useState('');
	const indexRef = useRef(0);

	useEffect(() => {
		setDisplayed('');
		indexRef.current = 0;

		const interval = setInterval(() => {
			indexRef.current += 1;
			setDisplayed(text.slice(0, indexRef.current));

			if (indexRef.current >= text.length) {
				clearInterval(interval);
				onComplete?.();
			}
		}, speed);

		return () => clearInterval(interval);
	}, [text, speed, onComplete]);

	return <span>{displayed}</span>;
}
