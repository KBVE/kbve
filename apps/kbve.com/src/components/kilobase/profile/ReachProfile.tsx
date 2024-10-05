import React, { useEffect, useState } from 'react';
import { kilobase } from '@kbve/laser'; // Import kilobase to access user profile
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';
import { $profileStore, eventEmitterInstance, type UserProfileUpdateEvent } from '@kbve/laser'; // Import the profile store and event emitter
import { useStore } from '@nanostores/react'; // Import nanostores for state management

const ReactProfile: React.FC = () => {
	const profile = useStore($profileStore); // Access the current profile from the store
	const [loading, setLoading] = useState(true); // Track loading state
	const [error, setError] = useState<string | null>(null); // Track any error state
	const [isModalOpen, setIsModalOpen] = useState(false); // State to track modal visibility

	// Use a single state object to track all form fields
	const [formData, setFormData] = useState({
		bio: profile.bio || '',
		avatar_url: profile.avatar_url || '',
	});

	// Update the formData whenever the profile data changes
	useEffect(() => {
		setFormData({
			bio: profile.bio || '',
			avatar_url: profile.avatar_url || '',
		});
	}, [profile]);

	// Regex pattern for bio: allows letters, numbers, spaces, periods, exclamation marks, and question marks
	const bioRegex = /^[a-zA-Z0-9.!? ]*$/;

	// Regex pattern for avatar URL: checks for valid URL structure
	const avatarUrlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;

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
		{ label: 'Avatar URL:', value: profile.avatar_url || 'No avatar URL' },
	];

	useEffect(() => {
		// Function to load profile
		const loadProfile = async () => {
			try {
				setLoading(true);
				await kilobase.loadProfileFromSupabase(); // Load profile from Supabase or local storage
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

	// Generic handler for input changes
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const { name, value } = e.target;
		setFormData((prevFormData) => ({
			...prevFormData,
			[name]: value, // Update the specific field
		}));
	};

	// Validate the form inputs before updating
	const validateForm = () => {
		// Validate bio using the regex pattern
		if (!bioRegex.test(formData.bio)) {
			setError('Bio contains invalid characters. Only letters, numbers, spaces, periods, !, and ? are allowed.');
			return false;
		}

		// Validate avatar URL using the regex pattern
		if (formData.avatar_url && !avatarUrlRegex.test(formData.avatar_url)) {
			setError('Invalid Avatar URL. Please enter a valid URL.');
			return false;
		}

		// Clear any existing errors if validation passes
		setError(null);
		return true;
	};

	// Handle form submission to update profile with the new bio and avatar_url
	const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setLoading(true);

		// Validate form inputs before proceeding
		if (!validateForm()) {
			setLoading(false);
			return;
		}

		try {
			// Check for a valid Supabase client instance
			const supabaseClient = kilobase.getSupabaseClient();
			if (!supabaseClient) {
				setError('Failed to get a valid Supabase client instance.');
				return;
			}

			// Update the profile with the new formData using Supabase
			const { data, error: supabaseError } = await supabaseClient
				.from('user_profiles')
				.update(formData) // Use the entire formData object for the update
				.eq('id', profile.id)
				.select();

			if (supabaseError || !data) {
				setError('Failed to update profile.');
				console.error('Error updating profile:', supabaseError);
				return;
			}

			// Emit the profileUpdated event with the updated fields
			const updateEvent: UserProfileUpdateEvent = {
				actionId: await kilobase.createActionULID('updateUserProfile'), // Create a new action ID
				updatedFields: { bio: formData.bio, avatar_url: formData.avatar_url }, // Include updated fields
				timestamp: new Date(),
			};
			// eventEmitterInstance.emit('profileUpdated', updateEvent);

			// Reload the profile to reflect updated data
			await kilobase.loadProfileFromSupabase();

			console.log(`Profile updated successfully: ${JSON.stringify(data)}`);
		} catch (err) {
			console.error('Failed to update profile:', err);
			setError('Failed to update profile. Please try again later.');
		} finally {
			setLoading(false);
			handleModalClose(); // Close modal after updating
		}
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
			<div className={twMerge('bg-yellow-50 dark:bg-neutral-900 rounded-lg shadow-lg p-8 max-w-md w-full')}>
				{/* Profile Header */}
				<div className="flex items-center justify-center mb-6">
					{profile.avatar_url ? (
						<img
							src={profile.avatar_url}
							alt="User Avatar"
							className={twMerge(
								'w-24 h-24 rounded-full shadow-lg',
								clsx({
									'border-2 border-cyan-500': profile.avatar_url,
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
					<button className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 focus:outline-none" onClick={handleEditProfileClick}>
						Edit Profile
					</button>
				</div>
			</div>

			{/* Custom Modal Implementation */}
			{isModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 max-w-lg w-full relative">
						{/* Modal Close Button */}
						<button className="absolute top-4 right-4 text-gray-500 dark:text-neutral-300 hover:text-gray-800 dark:hover:text-neutral-100" onClick={handleModalClose}>
							&times;
						</button>

						<div className="text-center">
							<h3 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">Edit Profile</h3>
							<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Update your profile details below.</p>
						</div>

						<div className="mt-5">
							<form onSubmit={handleSaveProfile}>
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
										value={formData.bio} // Link textarea value to formData
										onChange={handleInputChange} // Update formData on input change
									/>
								</div>

								{/* Form Group for Avatar URL */}
								<div className="mb-4">
									<label htmlFor="avatar_url" className="block text-sm font-medium text-neutral-600 dark:text-neutral-300">
										Avatar URL
									</label>
									<input
										id="avatar_url"
										name="avatar_url"
										type="text"
										className="mt-1 block w-full rounded-md border-gray-300 dark:border-neutral-700 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm dark:bg-neutral-900 dark:text-neutral-400"
										placeholder="Enter a valid avatar URL"
										value={formData.avatar_url} // Link input value to formData
										onChange={handleInputChange} // Update formData on input change
									/>
								</div>

								{/* Save Button */}
								<div className="flex justify-center">
									<button type="submit" className="w-full py-2 px-4 bg-cyan-500 text-white rounded hover:bg-cyan-600 focus:outline-none">
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
