-- Create artifacts table for storing generated documents with versioning support
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    root_id UUID NOT NULL, -- Groups all versions of the same artifact
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('document', 'guide', 'report', 'analysis')),
    version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT artifacts_title_length CHECK (char_length(title) <= 500),
    CONSTRAINT artifacts_version_positive CHECK (version > 0)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS artifacts_user_id_idx ON artifacts(user_id);
CREATE INDEX IF NOT EXISTS artifacts_root_id_idx ON artifacts(root_id);
CREATE INDEX IF NOT EXISTS artifacts_root_id_version_idx ON artifacts(root_id, version);
CREATE INDEX IF NOT EXISTS artifacts_updated_at_idx ON artifacts(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for artifacts
CREATE POLICY "Users can view own artifacts" ON artifacts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own artifacts" ON artifacts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own artifacts" ON artifacts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own artifacts" ON artifacts
    FOR DELETE USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_artifacts_updated_at BEFORE UPDATE ON artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 