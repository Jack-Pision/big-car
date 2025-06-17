'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn, signUp, resetPassword } from '@/lib/auth';
import { Eye, EyeOff, Mail, Lock, User, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setShowPassword(false);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (!fullName.trim()) {
          toast.error('Please enter your full name');
          return;
        }
        await signUp(email, password, fullName);
        toast.success('Account created! Please check your email for verification.');
        setMode('signin');
        resetForm();
      } else if (mode === 'signin') {
        await signIn(email, password);
        toast.success('Welcome back!');
        onAuthSuccess();
        handleClose();
      } else if (mode === 'forgot') {
        await resetPassword(email);
        toast.success('Password reset email sent!');
        setMode('signin');
        resetForm();
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const modalContent = () => {
    switch (mode) {
      case 'signup':
        return {
          title: 'Create your account',
          subtitle: 'Join Tehom AI to get started',
          buttonText: 'Create Account',
          switchText: 'Already have an account?',
          switchLink: 'Sign in',
          switchAction: () => setMode('signin'),
        };
      case 'forgot':
        return {
          title: 'Reset your password',
          subtitle: 'Enter your email to receive a reset link',
          buttonText: 'Send Reset Link',
          switchText: 'Remember your password?',
          switchLink: 'Back to sign in',
          switchAction: () => setMode('signin'),
        };
      default:
        return {
          title: 'Welcome back',
          subtitle: 'Sign in to your Tehom AI account',
          buttonText: 'Sign In',
          switchText: "Don't have an account?",
          switchLink: 'Sign up',
          switchAction: () => setMode('signup'),
        };
    }
  };

  const content = modalContent();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={handleClose}
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
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>

            <div className="p-8">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <img src="/Logo.svg" alt="Tehom AI" className="h-12 w-auto" />
              </div>

              {/* Header */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  {content.title}
                </h2>
                <p className="text-gray-600 text-sm">
                  {content.subtitle}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        placeholder="Enter your full name"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        placeholder="Enter your password"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    {mode === 'signup' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Password must be at least 6 characters long
                      </p>
                    )}
                  </div>
                )}

                {/* Forgot Password Link */}
                {mode === 'signin' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-sm text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Loading...
                    </div>
                  ) : (
                    content.buttonText
                  )}
                </button>
              </form>

              {/* Switch Mode */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {content.switchText}{' '}
                  <button
                    type="button"
                    onClick={content.switchAction}
                    className="text-blue-600 hover:text-blue-500 font-medium transition-colors"
                  >
                    {content.switchLink}
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 