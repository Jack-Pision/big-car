import { createClient } from '@supabase/supabase-js';

// Function to create Supabase client only on the client side
export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Only create client if both URL and key are available
  if (typeof window !== 'undefined' && supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  // Return null or a mock client for server-side rendering
  return null;
}

// Export a function instead of a direct client
export const supabase = createSupabaseClient(); 