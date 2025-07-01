'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { migrateExistingData, getUserId } from '@/lib/local-storage-service';
import SettingsModal from './SettingsModal';

interface User {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  showAuthModal: () => void;
  showSettingsModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    // Initialize with local user ID - no authentication needed for local storage
    const userId = getUserId();
    setUser({
      id: userId,
      email: 'local@user.com', // Placeholder email for local mode
      user_metadata: {
        full_name: 'Local User'
      }
    });
    
    // Migrate any existing data structure if needed
    migrateExistingData();
    
    setLoading(false);
  }, []);

  const showAuthModal = () => {
    // No-op for local mode - no authentication required
  };
  
  const showSettingsModal = () => setSettingsModalOpen(true);

  const handleSignOut = () => {
    // No-op for local mode - can't sign out from local storage
    setSettingsModalOpen(false);
  };

  const value = {
    user,
    loading,
    showAuthModal,
    showSettingsModal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        user={user}
        onSignOut={handleSignOut}
      />
    </AuthContext.Provider>
  );
} 