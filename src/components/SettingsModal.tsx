'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from '@/lib/auth';
import { X, LogOut, User, Shield, HelpCircle } from 'lucide-react';
import Image from 'next/image';
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
          className="fixed inset-0 bg-[#161618] z-[10000] flex items-center justify-center p-6"
          onClick={onClose}
        >
          {/* Simple Dark Grid Background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/20 via-neutral-900/15 to-black/25"></div>
            <div 
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px'
              }}
            ></div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 50 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Main Container */}
            <div className="relative bg-neutral-800 rounded-2xl border border-neutral-700 shadow-2xl overflow-hidden">
            {/* Close Button */}
            <button
              onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-neutral-700 transition-colors z-10"
            >
                <X size={20} className="text-neutral-400 hover:text-neutral-200" />
            </button>

              <div className="relative p-6">
                {/* Logo Section */}
                <div className="flex items-center justify-center mb-6">
                  <Image 
                    src="/Logo.svg" 
                    alt="Logo" 
                    width={90} 
                    height={90} 
                    className="text-neutral-100" 
                  />
                </div>

                {/* Header */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-neutral-100 mb-2 tracking-tight">
                  Account Settings
                </h2>
                  <p className="text-neutral-400 text-xs leading-relaxed">
                  Manage your Tehom AI account
                </p>
              </div>

              {/* User Info */}
              {user && (
                  <div className="bg-neutral-700 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                      <User size={20} className="text-neutral-400" />
                    <div>
                        <p className="font-medium text-neutral-100">
                        {user.user_metadata?.full_name || 'User'}
                      </p>
                        <p className="text-sm text-neutral-400">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Options */}
                <div className="space-y-2 mb-6">
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-700 transition-colors text-left">
                    <Shield size={20} className="text-neutral-400" />
                  <div>
                      <p className="font-medium text-neutral-100">Privacy & Security</p>
                      <p className="text-sm text-neutral-400">Manage your privacy settings</p>
                  </div>
                </button>

                  <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-700 transition-colors text-left">
                    <HelpCircle size={20} className="text-neutral-400" />
                  <div>
                      <p className="font-medium text-neutral-100">Help & Support</p>
                      <p className="text-sm text-neutral-400">Get help and contact support</p>
                  </div>
                </button>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 p-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 transition-colors text-red-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-red-600/30"
              >
                {isLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-400"></div>
                ) : (
                  <LogOut size={20} />
                )}
                {isLoading ? 'Signing out...' : 'Sign Out'}
              </button>

              {/* App Info */}
                <div className="mt-6 pt-4 border-t border-neutral-700 text-center">
                  <Image 
                    src="/Logo.svg" 
                    alt="Tehom AI" 
                    width={90} 
                    height={90} 
                    className="mx-auto mb-2" 
                  />
                  <p className="text-xs text-neutral-500">
                  Tehom AI • Version 1.0.0
                </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 