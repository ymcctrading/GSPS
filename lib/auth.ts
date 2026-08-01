import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function verifyAuth(req: NextRequest): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
