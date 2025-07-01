'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentSession, onAuthStateChange } from '@/lib/auth';
import { migrateLocalStorageToSupabase, clearLocalStorageData, hasLocalStorageData } from '@/lib/migrate-to-supabase';
import AuthModal from './AuthModal';
import SettingsModal from './SettingsModal';
import toast from 'react-hot-toast';

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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    // Check current session
    getCurrentSession().then((session) => {
      if (session?.user && session.user.email) {
        setUser(session.user as User);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (session) => {
      if (session?.user && session.user.email) {
        setUser(session.user as User);
        setAuthModalOpen(false);
        
        // Check for localStorage data migration
        if (hasLocalStorageData()) {
          try {
            const result = await migrateLocalStorageToSupabase();
            if (result.success && (result.sessionsCount > 0 || result.messagesCount > 0)) {
              toast.success(`Successfully migrated ${result.sessionsCount} sessions and ${result.messagesCount} messages to your account!`);
              clearLocalStorageData();
            }
          } catch (error) {
            console.error('Migration failed:', error);
            toast.error('Failed to migrate your chat history. Please contact support if this persists.');
          }
        }
      } else {
        setUser(null);
        setAuthModalOpen(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const showAuthModal = () => setAuthModalOpen(true);
  const showSettingsModal = () => setSettingsModalOpen(true);

  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
  };

  const handleSignOut = () => {
    setUser(null);
    setSettingsModalOpen(false);
    setAuthModalOpen(true);
  };

  const value = {
    user,
    loading,
    showAuthModal,
    showSettingsModal,
  };

  // Show auth modal immediately if no user and not loading
  useEffect(() => {
    if (!loading && !user) {
      setAuthModalOpen(true);
    }
  }, [loading, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {}} // Prevent closing until authenticated
        onAuthSuccess={handleAuthSuccess}
      />
      
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        user={user}
        onSignOut={handleSignOut}
      />
    </AuthContext.Provider>
  );
} 