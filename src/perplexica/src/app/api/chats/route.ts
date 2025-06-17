import { supabase } from '../../../../../lib/auth';

export const GET = async (req: Request) => {
  try {
    // Fetch sessions as chats equivalent
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('Error fetching sessions:', error);
      return Response.json({ message: 'Failed to fetch chats.' }, { status: 500 });
    }
    // Map sessions to chat shape if needed
    const chats = sessions.map((sess: any) => ({
      id: sess.id,
      title: sess.title,
      createdAt: sess.created_at,
    }));
    return Response.json({ chats }, { status: 200 });
  } catch (err) {
    console.error('Error in getting chats:', err);
    return Response.json({ message: 'An error has occurred.' }, { status: 500 });
  }
};
