import { createSupabaseClient } from './supabase-client';

export interface ArtifactV2 {
  id?: string;
  user_id: string;
  session_id?: string;
  title: string;
  content_markdown: string;
  content_json?: any;
  version?: number;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export class ArtifactV2Service {
  static async create(artifact: Omit<ArtifactV2, 'id' | 'created_at' | 'updated_at'>): Promise<ArtifactV2 | null> {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('artifacts_v2')
      .insert([{ ...artifact }])
      .select('*');
    if (error) throw error;
    return data ? data[0] as ArtifactV2 : null;
  }

  static async getById(id: string): Promise<ArtifactV2 | null> {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('artifacts_v2')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as ArtifactV2;
  }

  static async update(id: string, updates: Partial<ArtifactV2>): Promise<ArtifactV2 | null> {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('artifacts_v2')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ArtifactV2;
  }

  static async listByUser(user_id: string): Promise<ArtifactV2[]> {
    const supabase = createSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('artifacts_v2')
      .select('*')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data as ArtifactV2[];
  }
} 