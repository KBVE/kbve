import React, { useEffect, useState } from 'react';
import { kilobase } from '@kbve/laser'; // Import kilobase to access user profile
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';
import { $profileStore, eventEmitterInstance, type UserProfile, type UserProfileUpdateEvent } from '@kbve/laser'; // Import the profile store and event emitter
import { useStore } from '@nanostores/react'; // Import nanostores for state management

const ReactProfile: React.FC = () => {
	const profile = useStore($profileStore); // Access the current profile from the store
	const [loading, setLoading] = useState(true); // Track loading state
	const [error, setError] = useState<string | null>(null); // Track any error state
	const [isModalOpen, setIsModalOpen] = useState(false); // State to track modal visibility

	const profileFields = [
		{ label: 'Full Name:', value: profile.fullName || 'N/A' },
		{ label: 'Username:', value: profile.username || 'N/A' },
		{ label: 'Email:', value: profile.email || 'N/A' },
		{ label: 'User ID:', value: profile.id || 'N/A' },
		{
			label: 'Last Updated:',
			value: profile.updatedAt ? profile.updatedAt.toLocaleString() : 'N/A',
		},
		{ label: 'Bio:', value: profile.bio || 'No bio available' },
	];

	useEffect(() => {
		// Function to load profile
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

	useEffect(() => {
		// Listen for 'openModal' events and open the modal
		const openModalListener = () => {
			setIsModalOpen(true);
		};

		// Register event listener
		eventEmitterInstance.on('openModal', openModalListener);

		// Cleanup event listener on component unmount
		return () => {
			eventEmitterInstance.off('openModal', openModalListener);
		};
	}, []);

	// Function to trigger the 'openModal' event
	const handleEditProfileClick = () => {
		eventEmitterInstance.emit('openModal', { message: 'Edit Profile' });
	};

	const handleModalClose = () => {
		setIsModalOpen(false); // Close the modal when the close button is clicked or overlay is clicked
	};

	// Render loading state if data is being fetched
	if (loading) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-lg text-neutral-600 dark:text-neutral-200">Loading profile...</p>
			</div>
		);
	}

	// Render error message if there is an error
	if (error) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-lg text-red-500 dark:text-red-400">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-yellow-50/60 dark:bg-neutral-800 p-5">
			<div
				className={twMerge(
					'bg-yellow-50 dark:bg-neutral-900 rounded-lg shadow-lg p-8 max-w-md w-full',
				)}
			>
				{/* Profile Header */}
				<div className="flex items-center justify-center mb-6">
					{profile.avatarUrl ? (
						<img
							src={profile.avatarUrl}
							alt="User Avatar"
							className={twMerge(
								'w-24 h-24 rounded-full shadow-lg',
								clsx({
									'border-2 border-cyan-500': profile.avatarUrl,
								}),
							)}
						/>
					) : (
						<div className="w-24 h-24 bg-gray-200 dark:bg-neutral-700 rounded-full flex items-center justify-center">
							<span className="text-2xl font-bold text-neutral-600 dark:text-neutral-200">U</span>
						</div>
					)}
				</div>

				{/* Profile Information */}
				<div className="text-center mb-6">
					<h1 className="text-2xl font-semibold text-neutral-700 dark:text-neutral-100 mb-2">
						{profile.username || 'Unknown User'}
					</h1>
					<p className="text-neutral-600 dark:text-neutral-300 mb-4">{profile.email || 'No email available'}</p>
				</div>

				{/* Profile Details using .map */}
				<div className="text-center">
					{profileFields.map((field, index) => (
						<div className="mb-4" key={index}>
							<span className="font-bold text-neutral-600 dark:text-neutral-200">{field.label}</span>{' '}
							<span className="text-neutral-800 dark:text-neutral-300">{field.value}</span>
						</div>
					))}
				</div>

				{/* Edit Profile Button */}
				<div className="flex justify-center mt-6">
					<button
						className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 focus:outline-none"
						onClick={handleEditProfileClick}
					>
						Edit Profile
					</button>
				</div>
			</div>

			{/* Custom Modal Implementation */}
			{isModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 max-w-lg w-full relative">
						{/* Modal Close Button */}
						<button
							className="absolute top-4 right-4 text-gray-500 dark:text-neutral-300 hover:text-gray-800 dark:hover:text-neutral-100"
							onClick={handleModalClose}
						>
							&times;
						</button>

						<div className="text-center">
							<h3 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">Edit Profile</h3>
							<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Update your profile details below.</p>
						</div>

						<div className="mt-5">
							<form>
								{/* Form Group for Bio */}
								<div className="mb-4">
									<label htmlFor="bio" className="block text-sm font-medium text-neutral-600 dark:text-neutral-300">
										Bio
									</label>
									<textarea
										id="bio"
										name="bio"
										className="mt-1 block w-full rounded-md border-gray-300 dark:border-neutral-700 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm dark:bg-neutral-900 dark:text-neutral-400"
										placeholder="Tell us about yourself..."
										defaultValue={profile.bio}
									/>
								</div>

								{/* Save Button */}
								<div className="flex justify-center">
									<button
										type="submit"
										className="w-full py-2 px-4 bg-cyan-500 text-white rounded hover:bg-cyan-600 focus:outline-none"
									>
										Save Changes
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ReactProfile;
