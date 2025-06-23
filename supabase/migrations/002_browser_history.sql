-- Create browser_history table
CREATE TABLE IF NOT EXISTS browser_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_summary TEXT,
    sources_count INTEGER DEFAULT 0,
    search_results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT browser_history_query_length CHECK (char_length(query) <= 500)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS browser_history_user_id_idx ON browser_history(user_id);
CREATE INDEX IF NOT EXISTS browser_history_created_at_idx ON browser_history(created_at DESC);
CREATE INDEX IF NOT EXISTS browser_history_query_idx ON browser_history(query);

-- Enable Row Level Security
ALTER TABLE browser_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for browser_history
CREATE POLICY "Users can view own browser history" ON browser_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own browser history" ON browser_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own browser history" ON browser_history
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own browser history" ON browser_history
    FOR DELETE USING (auth.uid() = user_id); 