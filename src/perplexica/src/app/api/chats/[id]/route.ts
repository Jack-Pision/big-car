import { supabase } from '../../../../../../lib/auth';

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    // Check session exists in Supabase
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, created_at')
      .eq('id', id)
      .single();
    if (sessionError) {
      console.error('Error fetching session:', sessionError);
      return Response.json({ message: 'An error has occurred.' }, { status: 500 });
    }
    if (!session) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    // Fetch related messages
    const { data: chatMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return Response.json({ message: 'An error has occurred.' }, { status: 500 });
    }

    return Response.json(
      {
        chat: session,
        messages: chatMessages,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in getting chat by id: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};

export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    // Check session exists
    const { data: existing, error: existError } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', id)
      .single();
    if (existError) {
      console.error('Error fetching session:', existError);
      return Response.json({ message: 'An error has occurred.' }, { status: 500 });
    }
    if (!existing) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    // Delete session and related messages in Supabase
    const { error: deleteMsgsError } = await supabase
      .from('messages')
      .delete()
      .eq('session_id', id);
    if (deleteMsgsError) console.error('Error deleting messages:', deleteMsgsError);
    const { error: deleteSessionError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id);
    if (deleteSessionError) console.error('Error deleting session:', deleteSessionError);

    return Response.json(
      { message: 'Chat deleted successfully' },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in deleting chat by id: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
