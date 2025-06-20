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
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-indigo-900/20" />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Main Glass Container */}
            <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/5" />
              
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200 z-10 group"
              >
                <X size={18} className="text-white/80 group-hover:text-white" />
              </button>

              <div className="relative p-8">
                {/* Logo Section */}
                <div className="flex items-center justify-center mb-8">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full blur-lg opacity-30 animate-pulse" />
                    <div className="relative bg-white/10 backdrop-blur-sm rounded-full p-3 border border-white/20">
                      <Sparkles size={32} className="text-white" />
                    </div>
                  </div>
                </div>

                {/* Header */}
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
                    {content.title}
                  </h2>
                  <p className="text-white/70 text-sm leading-relaxed">
                    {content.subtitle}
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {mode === 'signup' && (
                    <div className="space-y-2">
                      <label htmlFor="fullName" className="block text-sm font-medium text-white/90">
                        Full Name
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                        <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/50 z-10" size={20} />
                        <input
                          id="fullName"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="relative w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all duration-200"
                          placeholder="Enter your full name"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-white/90">
                      Email Address
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                      <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/50 z-10" size={20} />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="relative w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all duration-200"
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                  </div>

                  {mode !== 'forgot' && (
                    <div className="space-y-2">
                      <label htmlFor="password" className="block text-sm font-medium text-white/90">
                        Password
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                        <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/50 z-10" size={20} />
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="relative w-full pl-12 pr-14 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all duration-200"
                          placeholder="Enter your password"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors z-10"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                      {mode === 'signup' && (
                        <p className="text-xs text-white/60 mt-2">
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
                        className="text-sm text-white/70 hover:text-white transition-colors"
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
                      <div className="absolute inset-0 bg-gradient-to-r from-white to-gray-50 rounded-xl" />
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative py-4 px-6 text-gray-900 font-semibold text-lg tracking-wide transition-all duration-200 group-hover:text-gray-800 group-disabled:opacity-50">
                        {isLoading ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 mr-3"></div>
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
                <div className="mt-8 text-center">
                  <p className="text-sm text-white/70">
                    {content.switchText}{' '}
                    <button
                      type="button"
                      onClick={content.switchAction}
                      className="text-white font-medium hover:text-white/80 transition-colors underline underline-offset-2"
                    >
                      {content.switchLink}
                    </button>
                  </p>
                </div>

                {/* Marketing Footer */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  <div className="text-center">
                    <p className="text-xs text-white/50 leading-relaxed">
                      Experience the next generation of AI-powered conversations with advanced reasoning capabilities
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-xl animate-pulse" />
            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-gradient-to-tl from-purple-400/20 to-pink-400/20 rounded-full blur-xl animate-pulse delay-1000" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 