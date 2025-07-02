'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getGoogleOAuthService } from '../../../../lib/google-oauth-service';

function GoogleOAuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const state = searchParams.get('state');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      setMessage('Exchanging authorization code for tokens...');

      // Exchange code for tokens
      const oauthService = getGoogleOAuthService();
      const credentials = await oauthService.exchangeCodeForTokens(code);

      setStatus('success');
      setMessage('Authentication successful! You can now close this window.');

      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_OAUTH_SUCCESS',
          credentials: credentials
        }, window.location.origin);
      }

      // Close popup after short delay
      setTimeout(() => {
        window.close();
      }, 2000);

    } catch (error) {
      console.error('OAuth callback error:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Authentication failed');

      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_OAUTH_ERROR',
          error: error instanceof Error ? error.message : 'Authentication failed'
        }, window.location.origin);
      }

      // Close popup after delay
      setTimeout(() => {
        window.close();
      }, 3000);
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        );
      case 'success':
        return (
          <div className="rounded-full h-8 w-8 bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="rounded-full h-8 w-8 bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getTextColor = () => {
    switch (status) {
      case 'processing':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="mb-4">
            {getIcon()}
          </div>

          {/* Title */}
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Google Authentication
          </h1>

          {/* Message */}
          <p className={`text-sm ${getTextColor()} mb-4`}>
            {message}
          </p>

          {/* Additional Info */}
          {status === 'success' && (
            <div className="text-xs text-gray-500">
              This window will close automatically...
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">
                This window will close automatically...
              </div>
              <button
                onClick={() => window.close()}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Close window manually
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoogleOAuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex flex-col items-center text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Google Authentication</h1>
            <p className="text-sm text-blue-600">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <GoogleOAuthCallbackContent />
    </Suspense>
  );
} 