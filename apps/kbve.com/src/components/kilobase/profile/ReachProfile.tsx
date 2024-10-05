import React, { useEffect, useState } from 'react';
import { kilobase } from '@kbve/laser'; // Import kilobase to access user profile
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';
import { $profileStore } from '@kbve/laser'; // Import the profile store
import { useStore } from '@nanostores/react'; // Import nanostores for state management

const ReactProfile: React.FC = () => {
	const profile = useStore($profileStore); // Access the current profile from the store
	const [loading, setLoading] = useState(true); // Track loading state
	const [error, setError] = useState<string | null>(null); // Track any error state

	const profileFields = [
		{ label: 'Full Name:', value: profile.fullName || 'N/A' },
		{ label: 'Username:', value: profile.username || 'N/A' },
		{ label: 'Email:', value: profile.email || 'N/A' },
		{ label: 'User ID:', value: profile.id || 'N/A' },
		{
			label: 'Last Updated:',
			value: profile.updatedAt
				? profile.updatedAt.toLocaleString()
				: 'N/A',
		},
	];

	useEffect(() => {
		const loadProfile = async () => {
			try {
				setLoading(true);
				await kilobase.loadProfile(); // Load profile from Supabase or local storage
			} catch (err) {
				console.error('Failed to load profile:', err);
				setError('Failed to load profile. Please try again later.');
			} finally {
				setLoading(false); // Set loading to false after profile is loaded or error is thrown
			}
		};

		loadProfile(); // Call the function to load profile data
	}, []);

	// Render loading state if data is being fetched
	if (loading) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-lg">Loading profile...</p>
			</div>
		);
	}

	// Render error message if there is an error
	if (error) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-red-500 text-lg">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-yellow-50/60 dark:bg-neutral-800 p-5">
			<div
				className={twMerge(
					'bg-yellow-50 dark:bg-neutral-900 rounded-lg shadow-lg p-8 max-w-md w-full',
				)}>
				{/* Profile Header */}
				<div className="flex items-center justify-center mb-6">
					{profile.avatarUrl ? (
						<img
							src={profile.avatarUrl}
							alt="User Avatar"
							className={twMerge(
								'w-24 h-24 rounded-full shadow-lg',
								clsx({
									'border-2 border-cyan-500':
										profile.avatarUrl,
								}),
							)}
						/>
					) : (
						<div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center">
							<span className="text-2xl font-bold text-gray-500">
								U
							</span>
						</div>
					)}
				</div>

				{/* Profile Information */}
				<div className="text-center mb-6">
					<h1 className="text-2xl font-semibold text-gray-700 mb-2">
						{profile.username || 'Unknown User'}
					</h1>
					<p className="text-gray-500 mb-4">
						{profile.email || 'No email available'}
					</p>
				</div>

				{/* Profile Details using .map */}
				<div className="text-center">
					{profileFields.map((field, index) => (
						<div className="mb-4" key={index}>
							<span className="font-bold text-gray-600">
								{field.label}
							</span>{' '}
							<span className="text-gray-800">{field.value}</span>
						</div>
					))}
				</div>

				{/* Edit Profile Button (Optional) */}
				<div className="flex justify-center mt-6">
					<button
						className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 focus:outline-none"
						onClick={() =>
							alert(
								'Navigate to edit profile (implementation needed)',
							)
						}>
						Edit Profile
					</button>
				</div>
			</div>
		</div>
	);
};

export default ReactProfile;
