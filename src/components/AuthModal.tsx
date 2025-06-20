'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn, signUp, resetPassword } from '@/lib/auth';
import { Eye, EyeOff, Mail, Lock, User, X, Sparkles } from 'lucide-react';
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
        const response = await signUp(email, password, fullName);
        
        // If we have a session, the user is already confirmed (email confirmation is disabled)
        if (response?.session) {
          toast.success('Account created successfully!');
          onAuthSuccess();
          handleClose();
        } else {
          // Email confirmation is enabled, show message to check email
          toast.success('Account created! Please check your email for verification.');
          setMode('signin');
          resetForm();
        }
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
          subtitle: 'Join the future of AI-powered conversations',
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
          subtitle: 'Sign in to continue your AI journey',
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
          className="fixed inset-0 bg-[#161618] z-[10000] flex items-center justify-end p-6"
          onClick={handleClose}
        >
          
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
                onClick={handleClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 transition-all duration-200 z-10 group"
              >
                <X size={16} className="text-neutral-100 group-hover:text-white" />
              </button>

              <div className="relative p-6">
                {/* Logo Section */}
                <div className="flex items-center justify-center mb-6">
                  <div className="relative">
                    <div className="relative bg-neutral-700 rounded-full p-2 border border-neutral-600">
                      <Sparkles size={24} className="text-neutral-100" />
                    </div>
                  </div>
                </div>

                {/* Header */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-neutral-100 mb-2 tracking-tight">
                    {content.title}
                  </h2>
                  <p className="text-neutral-400 text-xs leading-relaxed">
                    {content.subtitle}
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'signup' && (
                    <div className="space-y-1.5">
                      <label htmlFor="fullName" className="block text-xs font-medium text-neutral-200">
                        Full Name
                      </label>
                      <div className="relative group">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 z-10" size={16} />
                        <input
                          id="fullName"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="relative w-full pl-10 pr-3 py-3 bg-neutral-700 border border-neutral-600 rounded-lg text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500 transition-all duration-200 text-sm"
                          placeholder="Enter your full name"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-xs font-medium text-neutral-200">
                      Email Address
                    </label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 z-10" size={16} />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="relative w-full pl-10 pr-3 py-3 bg-neutral-700 border border-neutral-600 rounded-lg text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500 transition-all duration-200 text-sm"
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                  </div>

                  {mode !== 'forgot' && (
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="block text-xs font-medium text-neutral-200">
                        Password
                      </label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 z-10" size={16} />
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="relative w-full pl-10 pr-12 py-3 bg-neutral-700 border border-neutral-600 rounded-lg text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500 transition-all duration-200 text-sm"
                          placeholder="Enter your password"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-200 transition-colors z-10"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {mode === 'signup' && (
                        <p className="text-xs text-neutral-400 mt-1">
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
                        className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="relative w-full group overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white to-gray-50 rounded-lg" />
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative py-3 px-4 text-gray-900 font-semibold text-sm tracking-wide transition-all duration-200 group-hover:text-gray-800 group-disabled:opacity-50">
                        {isLoading ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
                            Loading...
                          </div>
                        ) : (
                          content.buttonText
                        )}
                      </div>
                    </button>
                  </div>
                </form>

                {/* Switch Mode */}
                <div className="mt-6 text-center">
                  <p className="text-xs text-neutral-400">
                    {content.switchText}{' '}
                    <button
                      type="button"
                      onClick={content.switchAction}
                      className="text-neutral-100 font-medium hover:text-neutral-200 transition-colors underline underline-offset-2"
                    >
                      {content.switchLink}
                    </button>
                  </p>
                </div>

                {/* Marketing Footer */}
                <div className="mt-6 pt-4 border-t border-neutral-700">
                  <div className="text-center">
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      Experience the next generation of AI-powered conversations
                    </p>
                  </div>
                </div>
              </div>
            </div>


          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 