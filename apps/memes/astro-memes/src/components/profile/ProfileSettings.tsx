import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/layouts/core/tw';
import { 
  isAuthenticated, 
  userProfile, 
  userActions,
  isLoading 
} from '../../layouts/core/stores/userStore';
import { 
  User, 
  Mail, 
  Globe, 
  MapPin, 
  Edit3, 
  Save, 
  X, 
  Camera,
  Settings,
  Bell,
  Shield,
  Palette,
  Loader2
} from 'lucide-react';

interface ProfileFormData {
  username: string;
  display_name: string;
  bio: string;
  website: string;
  location: string;
}

export const ProfileSettings: React.FC = () => {
  const authenticated = useStore(isAuthenticated);
  const profile = useStore(userProfile);
  const loading = useStore(isLoading);
  
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'account'>('profile');
  const [formData, setFormData] = useState<ProfileFormData>({
    username: '',
    display_name: '',
    bio: '',
    website: '',
    location: ''
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        website: profile.website || '',
        location: profile.location || ''
      });
    }
  }, [profile]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation errors when user starts typing
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  const handleSaveProfile = async () => {
    const validation = userActions.validateProfile();
    
    // Additional validation for form data
    const errors: string[] = [];
    if (formData.username && formData.username.length < 3) {
      errors.push('Username must be at least 3 characters');
    }
    if (formData.bio && formData.bio.length > 500) {
      errors.push('Bio must be less than 500 characters');
    }
    if (formData.website && !formData.website.match(/^https?:\/\/.+/)) {
      errors.push('Website must be a valid URL');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      // Update the profile
      userActions.updateBasicProfile(formData);
      setIsEditing(false);
      setValidationErrors([]);
    } catch (error) {
      console.error('Error saving profile:', error);
      setValidationErrors(['Failed to save profile. Please try again.']);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset form to original values
    if (profile) {
      setFormData({
        username: profile.username || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        website: profile.website || '',
        location: profile.location || ''
      });
    }
    setIsEditing(false);
    setValidationErrors([]);
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'preferences' as const, label: 'Preferences', icon: Settings },
    { id: 'account' as const, label: 'Account', icon: Shield }
  ];

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-zinc-700 text-center">
          <Shield size={48} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Authentication Required</h2>
          <p className="text-neutral-400 mb-6">
            Please sign in to access your profile settings.
          </p>
          <a 
            href="/"
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-green-600 transition-all duration-200 transform hover:scale-105"
          >
            Return Home
          </a>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-700 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                Profile Settings
              </h1>
              <p className="text-neutral-400 mt-1">
                Manage your account and preferences
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-black text-lg font-bold">
                {profile.username?.[0]?.toUpperCase() || profile.email[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-700 mb-6">
          <div className="border-b border-zinc-700">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200',
                    activeTab === tab.id
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-600'
                  )}
                >
                  <tab.icon size={18} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <h4 className="text-red-400 font-medium mb-2">Please fix the following errors:</h4>
                    <ul className="text-red-300 text-sm space-y-1">
                      {validationErrors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Profile Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <User size={16} className="inline mr-2" />
                      Username
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Enter username"
                      />
                    ) : (
                      <p className="text-white py-2">{profile.username || 'Not set'}</p>
                    )}
                  </div>

                  {/* Display Name */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      Display Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.display_name}
                        onChange={(e) => handleInputChange('display_name', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Enter display name"
                      />
                    ) : (
                      <p className="text-white py-2">{profile.display_name || 'Not set'}</p>
                    )}
                  </div>

                  {/* Email (read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <Mail size={16} className="inline mr-2" />
                      Email
                    </label>
                    <p className="text-neutral-400 py-2">{profile.email}</p>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <Globe size={16} className="inline mr-2" />
                      Website
                    </label>
                    {isEditing ? (
                      <input
                        type="url"
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="https://example.com"
                      />
                    ) : (
                      <p className="text-white py-2">
                        {profile.website ? (
                          <a 
                            href={profile.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            {profile.website}
                          </a>
                        ) : (
                          'Not set'
                        )}
                      </p>
                    )}
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <MapPin size={16} className="inline mr-2" />
                      Location
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Enter location"
                      />
                    ) : (
                      <p className="text-white py-2">{profile.location || 'Not set'}</p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Bio
                  </label>
                  {isEditing ? (
                    <textarea
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                      placeholder="Tell us about yourself..."
                      maxLength={500}
                    />
                  ) : (
                    <p className="text-white py-2 min-h-[100px] bg-zinc-700/50 rounded-lg px-3">
                      {profile.bio || 'No bio set'}
                    </p>
                  )}
                  {isEditing && (
                    <p className="text-neutral-400 text-sm mt-1">
                      {formData.bio.length}/500 characters
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-4 pt-4 border-t border-zinc-700">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="px-4 py-2 text-neutral-300 hover:text-white border border-zinc-600 rounded-lg hover:border-zinc-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X size={16} className="inline mr-2" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        {isSaving ? (
                          <Loader2 size={16} className="inline mr-2 animate-spin" />
                        ) : (
                          <Save size={16} className="inline mr-2" />
                        )}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200"
                    >
                      <Edit3 size={16} className="inline mr-2" />
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <div className="text-center py-12">
                  <Palette size={48} className="text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Preferences</h3>
                  <p className="text-neutral-400">
                    Preference settings coming soon...
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="text-center py-12">
                  <Shield size={48} className="text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Account Settings</h3>
                  <p className="text-neutral-400">
                    Account management features coming soon...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
