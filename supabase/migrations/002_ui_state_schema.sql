-- Migration: Add UI State Persistence Tables
-- This migration adds comprehensive UI state tracking for chatbot interactions

-- Create ui_interaction_states table for storing complete UI state snapshots
CREATE TABLE IF NOT EXISTS ui_interaction_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    
    -- UI Context at time of interaction
    active_button TEXT NOT NULL CHECK (active_button IN ('chat', 'search', 'artifact', 'reasoning')),
    active_mode TEXT NOT NULL CHECK (active_mode IN ('chat', 'search')),
    query_type TEXT,
    
    -- Complete UI State Snapshot (JSON)
    ui_state JSONB NOT NULL,
    user_preferences JSONB DEFAULT '{}',
    
    -- Interaction Metadata
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('user_query', 'ai_response', 'mode_switch', 'setting_change')),
    interaction_sequence INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for images2 if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images2', 'images2', true)
ON CONFLICT (id) DO NOTHING;

-- Performance indexes for ui_interaction_states
CREATE INDEX IF NOT EXISTS ui_states_session_idx ON ui_interaction_states(session_id);
CREATE INDEX IF NOT EXISTS ui_states_user_idx ON ui_interaction_states(user_id);
CREATE INDEX IF NOT EXISTS ui_states_message_idx ON ui_interaction_states(message_id);
CREATE INDEX IF NOT EXISTS ui_states_created_at_idx ON ui_interaction_states(created_at DESC);
CREATE INDEX IF NOT EXISTS ui_states_interaction_type_idx ON ui_interaction_states(interaction_type);

-- Enable Row Level Security
ALTER TABLE ui_interaction_states ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ui_interaction_states
CREATE POLICY "Users can view own ui states" ON ui_interaction_states
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ui states" ON ui_interaction_states
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ui states" ON ui_interaction_states
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ui states" ON ui_interaction_states
    FOR DELETE USING (auth.uid() = user_id);

-- Storage RLS policies for images2 bucket
CREATE POLICY "Users can upload own images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'images2' AND auth.uid()::text = owner);

CREATE POLICY "Users can view own images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'images2' AND auth.uid()::text = owner);

CREATE POLICY "Images are publicly accessible" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'images2');

CREATE POLICY "Users can update own images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'images2' AND auth.uid()::text = owner);

CREATE POLICY "Users can delete own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'images2' AND auth.uid()::text = owner); 