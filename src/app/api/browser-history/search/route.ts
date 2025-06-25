import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase-client';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createSupabaseClient();
    
    if (!supabase) {
      return new Response(JSON.stringify({ error: 'Database connection failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get current user
    const authResponse = await supabase.auth.getUser();
    if (!authResponse || authResponse.error || !authResponse.data?.user) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Search for exact query match in browser history
    const { data, error } = await supabase
      .from('browser_history')
      .select('*')
      .eq('user_id', authResponse.data.user.id)
      .eq('query', query.trim())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error searching browser history:', error);
      return new Response(JSON.stringify({ error: 'Failed to search browser history' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data || []), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Browser history search API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 