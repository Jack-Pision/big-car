const { spawn } = require('child_process');

// Set up environment variables
process.env.SUPABASE_ACCESS_TOKEN = 'sbp_186c431e74b9efcf5ded7065da72c71c487781bf';

// SQL commands to set up RLS
const sqlCommands = [
  `-- Check if artifacts table exists
SELECT table_name, table_schema 
FROM information_schema.tables 
WHERE table_name = 'artifacts' AND table_schema = 'public';`,

  `-- Create artifacts table if it doesn't exist
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    root_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('document', 'guide', 'report', 'analysis')),
    version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT artifacts_title_length CHECK (char_length(title) <= 500),
    CONSTRAINT artifacts_version_positive CHECK (version > 0)
);`,

  `-- Add indexes for performance
CREATE INDEX IF NOT EXISTS artifacts_user_id_idx ON artifacts(user_id);
CREATE INDEX IF NOT EXISTS artifacts_root_id_idx ON artifacts(root_id);
CREATE INDEX IF NOT EXISTS artifacts_root_id_version_idx ON artifacts(root_id, version);
CREATE INDEX IF NOT EXISTS artifacts_updated_at_idx ON artifacts(updated_at DESC);`,

  `-- Enable Row Level Security
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;`,

  `-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own artifacts" ON artifacts;
DROP POLICY IF EXISTS "Users can insert own artifacts" ON artifacts;
DROP POLICY IF EXISTS "Users can update own artifacts" ON artifacts;
DROP POLICY IF EXISTS "Users can delete own artifacts" ON artifacts;`,

  `-- Create RLS policies for artifacts
CREATE POLICY "Users can view own artifacts" ON artifacts
    FOR SELECT USING (auth.uid() = user_id);`,

  `CREATE POLICY "Users can insert own artifacts" ON artifacts
    FOR INSERT WITH CHECK (auth.uid() = user_id);`,

  `CREATE POLICY "Users can update own artifacts" ON artifacts
    FOR UPDATE USING (auth.uid() = user_id);`,

  `CREATE POLICY "Users can delete own artifacts" ON artifacts
    FOR DELETE USING (auth.uid() = user_id);`,

  `-- Create trigger for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';`,

  `CREATE TRIGGER update_artifacts_updated_at BEFORE UPDATE ON artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'artifacts';`
];

console.log('Setting up RLS policies for artifacts table...');

// Execute each SQL command
async function executeSQL() {
  for (let i = 0; i < sqlCommands.length; i++) {
    const sql = sqlCommands[i];
    console.log(`\n--- Executing SQL ${i + 1}/${sqlCommands.length} ---`);
    console.log(sql.substring(0, 100) + '...');
    
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('npx', [
          '-y', 
          '@supabase/mcp-server-supabase@latest',
          '--project-ref=iutjopgclvwueughjjdm',
          '--sql',
          sql
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: 'sbp_186c431e74b9efcf5ded7065da72c71c487781bf' }
        });

        let output = '';
        let error = '';

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          error += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`Command failed with code ${code}: ${error}`));
          }
        });
      });

      console.log('✅ Success');
      if (result.trim()) {
        console.log('Result:', result.trim());
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      // Continue with next command even if one fails
    }
  }
}

executeSQL().then(() => {
  console.log('\n🎉 RLS setup completed!');
}).catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
}); 