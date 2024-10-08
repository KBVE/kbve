import React, { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { kilobase, eventEmitterInstance } from '@kbve/laser';

// Define the Vuplex interface and extend the window object inside this file
interface Vuplex {
	addEventListener(event: string, listener: (event: any) => void): void;
	removeEventListener(event: string, listener: (event: any) => void): void;
	postMessage(message: string): void;
}

// Extend the Window interface to include vuplex
declare global {
	interface Window {
		vuplex?: Vuplex; // Optional chaining in case vuplex is not immediately available
	}
}

interface FormData {
	email: string;
	password: string;
	captchaToken?: string; // Optional captcha token field if needed
}

const ReactUnity: React.FC = () => {
	const [isSignedIn, setIsSignedIn] = useState(false); // Track the user's sign-in state
	const [error, setError] = useState<string | null>(null); // Track any errors
	const [formData, setFormData] = useState<FormData>({ email: '', password: '' }); // Consolidated form state

	// Function to handle input changes
	const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		const { name, value } = event.target;
		setFormData((prevData) => ({
			...prevData,
			[name]: value,
		}));
	};

	// Function to handle sign-in using form data
	const handleSignIn = async () => {
		setError(null);

		// Create a unique actionId for tracking this login attempt
		const actionId = await kilobase.createActionULID('loginUser');

		try {
			// Perform login using the kilobase instance and the generated actionId
			const profile = await kilobase.loginUser(
				formData.email,
				formData.password,
				actionId,
				formData.captchaToken, // Include captcha token if available
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

	// Function to handle sign-out
	const handleSignOut = async () => {
		setError(null);
		try {
			// Attempt to log out the user using the kilobase instance
			await kilobase.removeProfile(); // This should handle user sign-out from Supabase and local cleanup

			setIsSignedIn(false);

			// Emit the redirect event to navigate to the login page after successful logout
			eventEmitterInstance.emit('redirectUser', {
				location: '/login', // Redirect to the login page or any other URL
				replace: true, // Use `replace` to avoid going back to the current page
			});

			// Notify Unity of successful sign-out
			if (window.vuplex) {
				window.vuplex.postMessage(JSON.stringify({ type: 'signOut', message: 'User signed out successfully.' }));
			}
		} catch (err) {
			console.error('Failed to log out:', err);
			setError('An error occurred during logout. Please try again.');
		}
	};

	// Handle form submission
	const handleFormSubmit = (event: FormEvent) => {
		event.preventDefault();
		handleSignIn();
	};

	// Setup Unity message listener
	useEffect(() => {
		const messageListener = (event: any) => {
			const json = event.data;
			console.log('JSON received from Unity: ', json);

			// Handle Unity messages based on the type
			switch (json.type) {
				case 'signIn':
					handleSignIn();
					break;
				case 'signOut':
					handleSignOut();
					break;
				default:
					console.log('Unknown message type:', json.type);
			}
		};

		// Setup the message listener if vuplex is ready
		const addMessageListener = () => {
			if (window.vuplex) {
				window.vuplex.addEventListener('message', messageListener);
			}
		};

		// Check if vuplex is available and add listener, or wait until it is ready
		if (window.vuplex) {
			addMessageListener();
		} else {
			const onVuplexReady = () => {
				addMessageListener();
				window.removeEventListener('vuplexready', onVuplexReady); // Remove the listener once vuplex is ready
			};
			window.addEventListener('vuplexready', onVuplexReady);
		}

		// Cleanup listener on component unmount
		return () => {
			if (window.vuplex) {
				window.vuplex.removeEventListener('message', messageListener);
			}
		};
	}, []);

	return (
		<div className="flex flex-col items-center justify-center h-screen p-4">
			{isSignedIn ? (
				<div className="text-center">
					<p className="text-lg">You are signed in!</p>
					<button
						className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
						onClick={handleSignOut}
					>
						Sign Out
					</button>
				</div>
			) : (
				<form className="w-full max-w-sm" onSubmit={handleFormSubmit}>
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
