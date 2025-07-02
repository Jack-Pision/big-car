'use client';

import React, { useState, useEffect } from 'react';
import { getGoogleOAuthService, DEFAULT_SCOPES, GoogleAuthCredentials } from '../lib/google-oauth-service';

interface GoogleOAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentials: GoogleAuthCredentials) => void;
  onError: (error: string) => void;
  requiredServices: string[];
  taskDescription: string;
}

export default function GoogleOAuthModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  requiredServices,
  taskDescription
}: GoogleOAuthModalProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      generateAuthUrl();
    }
  }, [isOpen]);

  const generateAuthUrl = () => {
    try {
      // Initialize OAuth service with configuration
      const oauthService = getGoogleOAuthService({
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: `${window.location.origin}/auth/google/callback`,
        scopes: DEFAULT_SCOPES
      });

      const url = oauthService.generateAuthUrl('task_automation');
      setAuthUrl(url);
    } catch (err) {
      setError('Failed to initialize Google OAuth');
      console.error('OAuth initialization error:', err);
    }
  };

  const handleAuthClick = () => {
    if (!authUrl) {
      setError('Authentication URL not ready');
      return;
    }

    setIsAuthenticating(true);
    
    // Open OAuth popup
    const popup = window.open(
      authUrl,
      'google-oauth',
      'width=500,height=600,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      setError('Popup blocked. Please allow popups for this site.');
      setIsAuthenticating(false);
      return;
    }

    // Listen for OAuth completion
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        setIsAuthenticating(false);
        
        // Check if authentication was successful
        setTimeout(() => {
          checkAuthenticationSuccess();
        }, 1000);
      }
    }, 1000);

    // Listen for postMessage from popup
    const messageListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        clearInterval(checkClosed);
        popup.close();
        setIsAuthenticating(false);
        onSuccess(event.data.credentials);
        window.removeEventListener('message', messageListener);
      } else if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
        clearInterval(checkClosed);
        popup.close();
        setIsAuthenticating(false);
        onError(event.data.error);
        window.removeEventListener('message', messageListener);
      }
    };

    window.addEventListener('message', messageListener);
  };

  const checkAuthenticationSuccess = async () => {
    try {
      const oauthService = getGoogleOAuthService();
      if (oauthService.isAuthenticated()) {
        const credentials = oauthService.getCredentials();
        if (credentials) {
          onSuccess(credentials);
        }
      }
    } catch (err) {
      console.error('Error checking authentication:', err);
    }
  };

  const getServiceIcon = (service: string) => {
    const icons = {
      gmail: '📧',
      calendar: '📅',
      drive: '📂',
      docs: '📝',
      sheets: '📊'
    };
    return icons[service as keyof typeof icons] || '🔗';
  };

  const getServiceName = (service: string) => {
    const names = {
      gmail: 'Gmail',
      calendar: 'Google Calendar',
      drive: 'Google Drive',
      docs: 'Google Docs',
      sheets: 'Google Sheets'
    };
    return names[service as keyof typeof names] || service;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Google Authorization Required
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Task Description */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Task:</strong> {taskDescription}
          </p>
        </div>

        {/* Required Services */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            This task requires access to:
          </h4>
          <div className="space-y-2">
            {requiredServices.map((service) => (
              <div key={service} className="flex items-center space-x-2">
                <span className="text-lg">{getServiceIcon(service)}</span>
                <span className="text-sm text-gray-600">{getServiceName(service)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Auth Button */}
        <div className="flex flex-col space-y-3">
          <button
            onClick={handleAuthClick}
            disabled={isAuthenticating || !authUrl}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 
                     text-white font-medium py-3 px-4 rounded-lg transition-colors
                     flex items-center justify-center space-x-2"
          >
            {isAuthenticating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 
                     font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Privacy Note */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">
            🔒 Your credentials are stored securely in your browser and only used for task automation. 
            You can revoke access at any time in your Google account settings.
          </p>
        </div>
      </div>
    </div>
  );
} 