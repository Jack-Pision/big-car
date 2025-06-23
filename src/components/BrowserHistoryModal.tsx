import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { browserHistoryService, BrowserHistoryItem } from '@/lib/browser-history-service';
import { useAuth } from './AuthProvider';

interface BrowserHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuery: (query: string) => void;
}

export default function BrowserHistoryModal({ isOpen, onClose, onSelectQuery }: BrowserHistoryModalProps) {
  const [history, setHistory] = useState<BrowserHistoryItem[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<BrowserHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = history.filter(item =>
        item.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.results_summary && item.results_summary.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredHistory(filtered);
    } else {
      setFilteredHistory(history);
    }
  }, [searchTerm, history]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const historyData = await browserHistoryService.getBrowserHistory(100);
      setHistory(historyData);
      setFilteredHistory(historyData);
    } catch (error) {
      console.error('Error loading browser history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const success = await browserHistoryService.deleteBrowserHistoryItem(id);
      if (success) {
        setHistory(prev => prev.filter(item => item.id !== id));
        setShowDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Error deleting history item:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      const success = await browserHistoryService.clearBrowserHistory();
      if (success) {
        setHistory([]);
        setFilteredHistory([]);
        setShowDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  };

  const handleSelectQuery = (query: string) => {
    onSelectQuery(query);
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays <= 7) {
      return `${diffDays - 1} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#2a2a2a] border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] m-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">Browser History</h2>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm('all')}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-700">
            <div className="relative">
              <svg 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search browser history..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#1a1a1a] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto max-h-96">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-2 text-gray-400">Loading history...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-400">
                  {searchTerm ? 'No matching history found' : 'No browser history yet'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchTerm ? 'Try a different search term' : 'Start searching to build your history'}
                </p>
              </div>
            ) : (
              <div className="p-4">
                {filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-start justify-between p-3 rounded-lg hover:bg-gray-700/50 cursor-pointer transition-colors mb-2"
                    onClick={() => handleSelectQuery(item.query)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"></circle>
                          <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <h3 className="text-white font-medium truncate">{item.query}</h3>
                      </div>
                      {item.results_summary && (
                        <p className="text-sm text-gray-400 truncate mb-1">{item.results_summary}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{formatDate(item.created_at)}</span>
                        {item.sources_count > 0 && (
                          <span>{item.sources_count} sources</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-all"
                      title="Delete this search"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <div className="bg-[#2a2a2a] border border-gray-700 rounded-lg shadow-xl p-6 w-80 text-white" onClick={e => e.stopPropagation()}>
              <div className="text-lg font-semibold mb-3">
                {showDeleteConfirm === 'all' ? 'Clear All History?' : 'Delete Search?'}
              </div>
              <div className="text-gray-300 mb-5">
                {showDeleteConfirm === 'all' 
                  ? 'Are you sure you want to clear all browser history? This action cannot be undone.'
                  : 'Are you sure you want to delete this search from your history?'
                }
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-sm font-medium transition-colors" 
                  onClick={() => setShowDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button 
                  className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                  onClick={() => showDeleteConfirm === 'all' ? handleClearAll() : handleDeleteItem(showDeleteConfirm)}
                >
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
} 