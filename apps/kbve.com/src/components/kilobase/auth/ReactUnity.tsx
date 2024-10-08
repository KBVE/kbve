import React, { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { kilobase, eventEmitterInstance, ClientSideRegex, KiloBaseState } from '@kbve/laser';

interface FormData {
	email: string;
	password: string;
	captchaToken?: string; // Optional captcha token field if needed
}

// Define the Vuplex interface and extend the window object inside this file
declare global {
	interface Window {
		vuplex?: {
			addEventListener(event: string, listener: (event: any) => void): void;
			removeEventListener(event: string, listener: (event: any) => void): void;
			postMessage(message: string): void;
		};
	}
}

const ReactUnity: React.FC = () => {
	const [isSignedIn, setIsSignedIn] = useState(false); // Track the user's sign-in state
	const [error, setError] = useState<string | null>(null); // Track any errors
	const [captchaToken, setCaptchaToken] = useState<string | null>(null); // Store the captcha token
	const [formData, setFormData] = useState<FormData>({ email: '', password: '' }); // Consolidated form state
	const [formVisible, setFormVisible] = useState(false); // Track form visibility state
	const [captchaLoaded, setCaptchaLoaded] = useState(false); // Track if captcha is loaded

	// Function to handle input changes
	const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		const { name, value } = event.target;
		setFormData((prevData) => ({
			...prevData,
			[name]: value,
		}));
	};

	// Load the hCaptcha script dynamically and set up callbacks
	useEffect(() => {
		const script = document.createElement('script');
		script.src = 'https://hcaptcha.com/1/api.js?onload=hcaptchaOnLoad&render=explicit';
		script.async = true;
		script.defer = true;
		document.body.appendChild(script);

		// Define global callback functions for hCaptcha
		(window as any).hcaptchaOnLoad = () => {
			setCaptchaLoaded(true);
		};

		(window as any).onSuccess = (token: string) => {
			setCaptchaToken(token); // Store the token in state
		};

		(window as any).onError = () => {
			setError('Captcha Error: Please try again.');
		};

		(window as any).onExpired = () => {
			setCaptchaToken(null); // Reset token when expired
			setError('Captcha expired: Please complete the captcha again.');
		};

		// Clean up on component unmount
		return () => {
			(window as any).hcaptchaOnLoad = undefined;
			(window as any).onSuccess = undefined;
			(window as any).onError = undefined;
			(window as any).onExpired = undefined;
			document.body.removeChild(script);
		};
	}, []);

	// Render the hCaptcha widget once it is loaded
	useEffect(() => {
		if (captchaLoaded && window.hcaptcha) {
			window.hcaptcha.render('h-captcha', {
				sitekey: KiloBaseState.get().hcaptcha, // Replace with your hCaptcha site key
				callback: 'onSuccess', // Function to call when captcha is successfully completed
				'expired-callback': 'onExpired', // Function to call when captcha expires
				'error-callback': 'onError', // Function to call when there's an error
			});
		}
	}, [captchaLoaded]);

	// Remove the skeleton loader and fade in the form once the component mounts
	useEffect(() => {
		const skeletonElement = document.getElementById('skeleton');
		if (skeletonElement) {
			skeletonElement.style.transition = 'opacity 0.5s ease-out';
			skeletonElement.style.opacity = '0';
			setTimeout(() => {
				skeletonElement.remove();
				setFormVisible(true);
			}, 500);
		} else {
			setFormVisible(true);
		}
	}, []);

	// Function to handle sign-in using form data and captcha token
	const handleSignIn = async () => {
		setError(null);

		if (!captchaToken) {
			setError('Please complete the captcha.');
			return;
		}

		// Create a unique actionId for tracking this login attempt
		const actionId = await kilobase.createActionULID('loginUser');

		try {
			// Perform login using the kilobase instance and the generated actionId
			const profile = await kilobase.loginUser(
				formData.email,
				formData.password,
				actionId,
				captchaToken, // Pass the captcha token to the login function
			);

			// Check if login was successful
			if (profile) {
				setIsSignedIn(true);

				// Notify Unity of successful sign-in
				if (window.vuplex) {
					window.vuplex.postMessage(JSON.stringify({ type: 'signIn', message: 'User signed in successfully.' }));
				}
			} else {
				// Get the detailed error message for this actionId
				const detailedError = await kilobase.getDetailedErrorByActionId(actionId);
				setError(detailedError || 'Failed to log in. Please try again.');
			}
		} catch (err) {
			console.error('Sign-in failed:', err);
			setError('An error occurred during sign-in. Please try again.');
		}
	};

	// Handle form submission
	const handleFormSubmit = (event: FormEvent) => {
		event.preventDefault();
		handleSignIn();
	};

	return (
		<div className="flex flex-col items-center justify-center h-screen p-4">
			{isSignedIn ? (
				<div className="text-center">
					<p className="text-lg">You are signed in!</p>
					<button
						className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
						onClick={() => {
							setIsSignedIn(false);
							setFormVisible(true);
						}}
					>
						Sign Out
					</button>
				</div>
			) : (
				<form
					className={`w-full max-w-sm transition-opacity duration-500 ${
						formVisible ? 'opacity-100' : 'opacity-0'
					}`}
					onSubmit={handleFormSubmit}
				>
					<h2 className="text-xl mb-4">Sign In</h2>
					<div className="mb-4">
						<label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
							Email
						</label>
						<input
							type="email"
							id="email"
							name="email"
							className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							value={formData.email}
							onChange={handleInputChange}
							required
						/>
					</div>
					<div className="mb-4">
						<label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
							Password
						</label>
						<input
							type="password"
							id="password"
							name="password"
							className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							value={formData.password}
							onChange={handleInputChange}
							required
						/>
					</div>
					{/* Render hCaptcha widget */}
					<div className="mb-4">
						<div id="h-captcha" className="my-4" />
					</div>
					<button
						type="submit"
						className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
					>
						Sign In
					</button>
					{error && <p className="text-red-500 mt-4">{error}</p>}
				</form>
			)}
		</div>
	);
};

export default ReactUnity;
