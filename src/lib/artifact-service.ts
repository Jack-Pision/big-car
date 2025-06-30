import { supabase } from './auth';
import { Artifact } from './types';
import { smartCache } from './smart-cache';

const CACHE_KEY_ALL = 'ARTIFACTS_ALL';

export class ArtifactService {
  private static instance: ArtifactService;

  static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService();
    }
    return ArtifactService.instance;
  }

  /*
   * Fetch all artifacts for the current user (cached for 5 min)
   */
  async list(): Promise<Artifact[]> {
    const cached = smartCache.get<Artifact[]>(CACHE_KEY_ALL);
    if (cached) return cached;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[ArtifactService] list() error:', error);
      return [];
    }

    smartCache.set(CACHE_KEY_ALL, data as Artifact[], 5 * 60 * 1000);
    return data as Artifact[];
  }

  /*
   * Fetch all versions of a single artifact (by title/id) sorted ascending
   */
  async getVersions(rootId: string): Promise<Artifact[]> {
    const cacheKey = `ARTIFACT_VERSIONS_${rootId}`;
    const cached = smartCache.get<Artifact[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('root_id', rootId) // assuming root_id groups versions
      .order('version', { ascending: true });

    if (error) {
      console.error('[ArtifactService] getVersions() error:', error);
      return [];
    }

    smartCache.set(cacheKey, data as Artifact[], 5 * 60 * 1000);
    return data as Artifact[];
  }

  /*
   * Create a new artifact (version 1)
   */
  async create(artifact: Omit<Artifact, 'id' | 'version' | 'created_at' | 'updated_at'>): Promise<Artifact | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const insertData = {
      ...artifact,
      version: 1,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as Artifact;

    const { data, error } = await supabase.from('artifacts').insert([insertData]).select('*').single();

    if (error) {
      console.error('[ArtifactService] create() error:', error);
      throw error;
    }

    // Invalidate cache
    smartCache.set(CACHE_KEY_ALL, null, 0);

    return data as Artifact;
  }

  /*
   * Save a new version for an existing artifact
   */
  async saveNewVersion(rootId: string, newContent: string, metadata: Artifact['metadata']): Promise<Artifact | null> {
    const versions = await this.getVersions(rootId);
    const latest = versions[versions.length - 1];

    const newVersionNumber = (latest?.version ?? 0) + 1;

    const newArtifact: Omit<Artifact, 'id' | 'created_at' | 'updated_at'> = {
      ...latest,
      content: newContent,
      version: newVersionNumber,
      metadata,
    } as any;

    // Remove id if copying spread of latest
    delete (newArtifact as any).id;

    const { data, error } = await supabase.from('artifacts').insert([{
      ...newArtifact,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]).select('*').single();

    if (error) {
      console.error('[ArtifactService] saveNewVersion() error:', error);
      throw error;
    }

    // Invalidate cache
    smartCache.set(CACHE_KEY_ALL, null, 0);
    smartCache.set(`ARTIFACT_VERSIONS_${rootId}`, null, 0);

    return data as Artifact;
  }

  /*
   * Fetch the latest version of an artifact by root_id
   */
  async getLatestVersion(rootId: string): Promise<Artifact | null> {
    const { data, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('root_id', rootId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('[ArtifactService] getLatestVersion() error:', error);
      return null;
    }
    return data as Artifact;
  }
} 