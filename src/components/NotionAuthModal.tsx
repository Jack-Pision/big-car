import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface NotionAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const NotionAuthModal: React.FC<NotionAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [authUrl, setAuthUrl] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Generate the OAuth URL - in a real implementation this would come from your backend
      const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID || '';
      const redirectUri = encodeURIComponent(
        `${window.location.origin}/api/notion/callback`
      );
      const url = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`;
      setAuthUrl(url);

      // Listen for messages from the OAuth callback
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data?.type === 'notion-oauth-success') {
          setIsAuthenticating(false);
          onSuccess();
          onClose();
        } else if (event.data?.type === 'notion-oauth-error') {
          setIsAuthenticating(false);
          setError(event.data.error || 'Authentication failed');
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [isOpen, onSuccess, onClose]);

  const handleAuthenticate = () => {
    setIsAuthenticating(true);
    setError('');
    // Open the OAuth flow in a popup window
    const width = 600;
    const height = 700;
    const left = window.innerWidth / 2 - width / 2;
    const top = window.innerHeight / 2 - height / 2;
    
    window.open(
      authUrl,
      'notion-oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Connect to Notion</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Connect your Notion account to enable seamless integration with your workspaces.
          </p>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <button
            onClick={handleAuthenticate}
            disabled={isAuthenticating}
            className={`w-full flex items-center justify-center gap-2 bg-black text-white py-2 px-4 rounded-md hover:bg-gray-800 transition-colors ${
              isAuthenticating ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isAuthenticating ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z" fill="white"/>
                </svg>
                <span>Connect to Notion</span>
              </>
            )}
          </button>
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-400">
          By connecting, you authorize this application to access your Notion workspaces according to the permissions you grant.
        </p>
      </div>
    </div>
  );
};

export default NotionAuthModal; 