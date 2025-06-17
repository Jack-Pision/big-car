-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT sessions_title_length CHECK (char_length(title) <= 200)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'search-ui')),
    content TEXT NOT NULL,
    image_urls TEXT[],
    web_sources JSONB,
    structured_content JSONB,
    parent_id UUID REFERENCES messages(id),
    query TEXT,
    is_search_result BOOLEAN DEFAULT FALSE,
    is_processed BOOLEAN DEFAULT TRUE,
    is_streaming BOOLEAN DEFAULT FALSE,
    content_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT messages_role_valid CHECK (role IN ('user', 'assistant', 'search-ui'))
);

-- Create board_content table for board functionality
CREATE TABLE IF NOT EXISTS board_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Document',
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT board_title_length CHECK (char_length(title) <= 200)
);

-- Create user_preferences table for settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    active_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_updated_at_idx ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_session_id_idx ON messages(session_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS board_content_user_id_idx ON board_content(user_id);
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sessions
CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for messages
CREATE POLICY "Users can view own messages" ON messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own messages" ON messages
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages" ON messages
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for board_content
CREATE POLICY "Users can view own board content" ON board_content
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own board content" ON board_content
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own board content" ON board_content
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own board content" ON board_content
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for user_preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences" ON user_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_content_updated_at BEFORE UPDATE ON board_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 