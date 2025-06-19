'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AuthProvider from '@/components/AuthProvider';
import TestChat from '@/app/test/page';

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const title = searchParams.get('title');

  return (
    <AuthProvider>
      <TestChat 
        initialSessionId={sessionId}
        initialSessionTitle={title || undefined}
      />
    </AuthProvider>
  );
} 