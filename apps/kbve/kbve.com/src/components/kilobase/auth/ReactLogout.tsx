import React, { useEffect, useState } from 'react';
import { kilobase, eventEmitterInstance } from '@kbve/laser';

const ReactLogout: React.FC = () => {
	const [isLoggingOut, setIsLoggingOut] = useState(false); // Track logging out state
	const [error, setError] = useState<string | null>(null); // Track any errors during logout

	// Function to handle the logout process
	const handleLogout = async () => {
		setIsLoggingOut(true); // Set logging out state to true

		try {
			// Attempt to log out the user using the kilobase instance
			await kilobase.removeProfile(); // This should handle user sign-out from Supabase and local cleanup

			// Emit the redirect event to navigate to the login page after successful logout
			eventEmitterInstance.emit('redirectUser', {
				location: '/login', // Redirect to the login page or any other URL
				replace: true, // Use `replace` to avoid going back to the current page
			});
		} catch (err) {
			console.error('Failed to log out:', err);
			setError('An error occurred during logout. Please try again.'); // Set error state
		} finally {
			setIsLoggingOut(false); // Reset logging out state
		}
	};

	// Trigger the logout process when the component mounts
	useEffect(() => {
		handleLogout();
	}, []); // Run once on component mount

	return (
		<div className="flex flex-col items-center justify-center h-screen">
			{isLoggingOut ? (
				<p className="text-lg">Logging out...</p>
			) : error ? (
				<p className="text-red-500">{error}</p>
			) : (
				<p className="text-lg">Redirecting...</p>
			)}
		</div>
	);
};

export default ReactLogout;
