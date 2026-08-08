import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TEST_USER_ID = 'test-user-for-learning-brain';

export async function verifyAuth(req: NextRequest): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      return user.id;
    }
  } catch (error) {
    // Auth check failed
  }

  return null;
}
