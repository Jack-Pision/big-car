import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase-client';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }
    
    // Get current user
    const authResponse = await supabase.auth.getUser();
    if (!authResponse || authResponse.error || !authResponse.data?.user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: 'Failed to search browser history' },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
    
  } catch (error) {
    console.error('Browser history search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 