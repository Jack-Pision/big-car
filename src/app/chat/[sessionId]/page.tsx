'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const title = searchParams.get('title');
  const router = useRouter();

  // Redirect to main test page with session ID in URL hash
  useEffect(() => {
    if (sessionId) {
      router.replace(`/test#session=${sessionId}${title ? `&title=${encodeURIComponent(title)}` : ''}`);
    }
  }, [sessionId, title, router]);

  return (
    <div className="h-screen w-screen bg-[#161618] text-white overflow-hidden flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-400">Loading chat session...</p>
      </div>
    </div>
  );
} 