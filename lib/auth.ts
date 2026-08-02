import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TEST_USER_ID = 'test-user-for-learning-brain';

export async function verifyAuth(req: NextRequest): Promise<string | null> {
  // Check for test mode via header (X-Test-Mode: true)
  const testModeHeader = req.headers.get('X-Test-Mode');
  const isTestMode = testModeHeader === 'true' || process.env.NODE_ENV === 'development';

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      return user.id;
    }
  } catch (error) {
    // Auth check failed, fall through to test mode check
  }

  // Allow test mode for learning brain testing
  if (isTestMode) {
    return TEST_USER_ID;
  }

  return null;
}
