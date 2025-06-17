'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from '@/lib/auth';
import { X, LogOut, User, Shield, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: {
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  } | null;
  onSignOut: () => void;
}

export default function SettingsModal({ isOpen, onClose, user, onSignOut }: SettingsModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      toast.success('Signed out successfully');
      onSignOut();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>

            <div className="p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-medium">
                    {user?.user_metadata?.full_name?.charAt(0) || user?.email.charAt(0).toUpperCase() || 'U'}
                  </div>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-1">
                  Account Settings
                </h2>
                <p className="text-gray-600 text-sm">
                  Manage your Tehom AI account
                </p>
              </div>

              {/* User Info */}
              {user && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <User size={20} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.user_metadata?.full_name || 'User'}
                      </p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Options */}
              <div className="space-y-2 mb-8">
                <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left">
                  <Shield size={20} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Privacy & Security</p>
                    <p className="text-sm text-gray-600">Manage your privacy settings</p>
                  </div>
                </button>

                <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left">
                  <HelpCircle size={20} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Help & Support</p>
                    <p className="text-sm text-gray-600">Get help and contact support</p>
                  </div>
                </button>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors text-red-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                ) : (
                  <LogOut size={20} />
                )}
                {isLoading ? 'Signing out...' : 'Sign Out'}
              </button>

              {/* App Info */}
              <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                <img src="/Logo.svg" alt="Tehom AI" className="h-8 w-auto mx-auto mb-2" />
                <p className="text-xs text-gray-500">
                  Tehom AI • Version 1.0.0
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 