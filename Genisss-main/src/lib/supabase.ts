import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createSupabaseClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'youtulabs-auth',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function signInWithGitHub() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

export async function signInWithEmail(email: string, password: string) {
  console.log('🔵 signInWithEmail called with email:', email);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  console.log('🔵 signInWithPassword response:', { data, error });
  return { data, error };
}

// Get user's IP address (approximation using public API)
async function getUserIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    console.error('Failed to get IP:', error);
    return 'unknown';
  }
}

export async function checkEmailExists(email: string): Promise<{exists: boolean; error?: string; rateLimited?: boolean}> {
  try {
    console.log('🔍 Checking if email exists:', email);

    // Get user IP for rate limiting
    const ipAddress = await getUserIP();
    console.log('📍 User IP:', ipAddress);

    const { data, error } = await supabase.rpc('check_email_exists', {
      p_email: email,
      p_ip_address: ipAddress
    });

    if (error) {
      console.error('❌ Failed to check email - RPC error:', error);
      return { exists: false }; // Fail open - allow registration if check fails
    }

    console.log('✅ Email check result:', data);

    // Data is JSONB: { exists: boolean, error: string|null, rate_limited: boolean }
    if (data.rate_limited) {
      return { exists: false, error: data.error, rateLimited: true };
    }

    return { exists: data.exists };
  } catch (error) {
    console.error('❌ Error checking email:', error);
    return { exists: false }; // Fail open
  }
}

export async function checkUsernameExists(username: string): Promise<{exists: boolean; error?: string; rateLimited?: boolean}> {
  try {
    console.log('🔍 Checking if username exists:', username);

    // Get user IP for rate limiting
    const ipAddress = await getUserIP();
    console.log('📍 User IP:', ipAddress);

    const { data, error } = await supabase.rpc('check_username_exists', {
      p_username: username,
      p_ip_address: ipAddress
    });

    if (error) {
      console.error('❌ Failed to check username - RPC error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return { exists: false };
    }

    console.log('✅ Username check result:', data);

    // Data is JSONB: { exists: boolean, error: string|null, rate_limited: boolean }
    if (data.rate_limited) {
      return { exists: false, error: data.error, rateLimited: true };
    }

    return { exists: data.exists };
  } catch (error) {
    console.error('❌ Error checking username (caught):', error);
    return { exists: false };
  }
}

// Fallback function if RPC doesn't work
async function checkUsernameManually(username: string): Promise<boolean> {
  console.log('⚠️ RPC function not available - username uniqueness check disabled');
  console.log('⚠️ Please apply SQL migration: supabase-migrations/015_add_username_uniqueness.sql');
  // Return false to allow registration when function is not available
  // This is temporary until the SQL migration is applied
  return false;
}

export async function signUpWithEmail(email: string, password: string, name?: string) {
  console.log('🔵 signUpWithEmail called with email:', email, 'name:', name);

  // Check if email already exists
  const emailCheck = await checkEmailExists(email);
  if (emailCheck.rateLimited) {
    const error = { message: emailCheck.error || 'Too many attempts. Please try again later.' };
    console.log('🔵 Rate limited - email check');
    return {
      data: { user: null, session: null },
      error: error as any
    };
  }
  if (emailCheck.exists) {
    const error = { message: 'This email is already registered. Try logging in instead.' };
    console.log('🔵 Email already exists:', email);
    return {
      data: { user: null, session: null },
      error: error as any
    };
  }

  // Check if username already exists
  if (name) {
    const usernameCheck = await checkUsernameExists(name);
    if (usernameCheck.rateLimited) {
      const error = { message: usernameCheck.error || 'Too many attempts. Please try again later.' };
      console.log('🔵 Rate limited - username check');
      return {
        data: { user: null, session: null },
        error: error as any
      };
    }
    if (usernameCheck.exists) {
      const error = { message: 'This username is already taken. Please choose another one.' };
      console.log('🔵 Username already exists:', name);
      return {
        data: { user: null, session: null },
        error: error as any
      };
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name || email.split('@')[0], // Використовуємо частину email якщо ім'я не вказане
      },
    },
  });

  console.log('🔵 signUp response - FULL:', { data, error });
  console.log('🔵 User object:', data.user);
  console.log('🔵 Session object:', data.session);
  console.log('🔵 Error object:', error);

  // Supabase doesn't return error for duplicate emails (security feature)
  // Instead, it returns user without session if email exists
  if (data.user && !data.session && !error) {
    console.log('⚠️ Email might already be registered (no session returned)');
  }

  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { data, error };
}

export async function getUserBalance() {
  console.log('💎 getUserBalance: Starting...');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.log('💎 No session found');
    return null;
  }

  console.log('💎 User ID:', session.user.id);

  try {
    // Call the get_user_balance function directly from Supabase
    const { data, error } = await supabase.rpc('get_user_balance', {
      p_user_id: session.user.id
    });

    if (error) {
      console.error('❌ Failed to fetch balance - Full error:', JSON.stringify(error, null, 2));
      console.error('❌ Error message:', error.message);
      console.error('❌ Error details:', error.details);
      console.error('❌ Error hint:', error.hint);
      return 0;
    }

    console.log('✅ Balance fetched successfully:', data);
    return data || 0;
  } catch (error) {
    console.error('❌ Error fetching balance:', error);
    return 0;
  }
}

export async function updateUserProfile(updates: { name?: string; avatar_url?: string }) {
  console.log('🟢 updateUserProfile called with:', updates);

  const { data, error } = await supabase.auth.updateUser({
    data: updates
  });

  console.log('🟢 updateUserProfile response:', { data, error });

  if (error) {
    console.error('Error updating profile:', error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function uploadAvatar(file: File) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: new Error('No session') };

  const fileExt = file.name.split('.').pop();
  const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      upsert: true
    });

  if (error) {
    console.error('Error uploading avatar:', error);
    return { data: null, error };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return { data: { path: filePath, url: publicUrl }, error: null };
}

// Subscription management functions
export async function getUserSubscription() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    const { data, error } = await supabase.rpc('get_user_subscription', {
      p_user_id: session.user.id
    });

    if (error) {
      console.error('Failed to fetch subscription:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

export async function updateUserSubscription(
  userId: string,
  planId: 'starter' | 'pro' | 'ultimate',
  status: 'active' | 'cancelled' | 'expired' | 'paused' = 'active',
  expiresAt?: string
) {
  try {
    const { data, error } = await supabase.rpc('update_user_subscription', {
      p_user_id: userId,
      p_plan_id: planId,
      p_status: status,
      p_expires_at: expiresAt || null
    });

    if (error) {
      console.error('Failed to update subscription:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating subscription:', error);
    return { data: null, error };
  }
}

export async function cancelUserSubscription(userId: string) {
  try {
    const { data, error } = await supabase.rpc('cancel_user_subscription', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to cancel subscription:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return { data: null, error };
  }
}

export async function getAllUsers() {
  try {
    console.log('🔵 getAllUsers: Starting request...');

    // Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('🔵 Current user:', user);
    console.log('🔵 User metadata:', user?.user_metadata);

    const { data, error } = await supabase.rpc('get_all_users_with_subscriptions');

    if (error) {
      console.error('❌ Failed to fetch users - Full error:', JSON.stringify(error, null, 2));
      console.error('❌ Error message:', error.message);
      console.error('❌ Error details:', error.details);
      console.error('❌ Error hint:', error.hint);
      return { data: null, error };
    }

    console.log('✅ Users fetched successfully:', data?.length, 'users');
    return { data, error: null };
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    return { data: null, error };
  }
}

export async function setUserBalance(userId: string, newBalance: number) {
  try {
    console.log('🔵 setUserBalance called with:', { userId, newBalance });
    const { data, error } = await supabase.rpc('admin_set_user_balance', {
      p_user_id: userId,
      p_new_balance: newBalance
    });

    if (error) {
      console.error('Failed to update balance - Full error:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      return { data: null, error };
    }

    console.log('✅ Balance updated, response:', data);
    return { data, error: null };
  } catch (error) {
    console.error('Error updating balance:', error);
    return { data: null, error };
  }
}

export async function deductBalance(amount: number, description: string = 'Story generation') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: new Error('No session') };

  try {
    console.log('💎 Deducting balance:', { amount, description });

    const { data, error } = await supabase.rpc('update_user_balance', {
      p_user_id: session.user.id,
      p_amount: -amount, // Negative for deduction
      p_type: 'generation',
      p_description: description,
      p_metadata: {}
    });

    if (error) {
      console.error('Failed to deduct balance:', error);
      return { data: null, error };
    }

    console.log('✅ Balance deducted successfully:', data);
    return { data, error: null };
  } catch (error) {
    console.error('Error deducting balance:', error);
    return { data: null, error };
  }
}

// Story management functions
export async function saveStory(story: {
  title?: string;
  content: string;
  genre?: string;
  duration?: number;
  language?: string;
  metadata?: any;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: new Error('No session') };

  try {
    // Generate title from first line of content
    const firstLine = story.content.split('\n')[0].trim();
    const generatedTitle = firstLine.length > 60
      ? firstLine.substring(0, 60) + '...'
      : firstLine;

    const { data, error } = await supabase
      .from('user_stories')
      .insert({
        user_id: session.user.id,
        title: story.title || generatedTitle || `Story ${new Date().toLocaleDateString()}`,
        content: story.content,
        genre: story.genre,
        duration: story.duration,
        language: story.language,
        metadata: story.metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save story:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error saving story:', error);
    return { data: null, error };
  }
}

export async function getUserStories() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: new Error('No session') };

  try {
    const { data, error } = await supabase.rpc('get_user_stories', {
      p_user_id: session.user.id
    });

    if (error) {
      console.error('Failed to fetch stories:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching stories:', error);
    return { data: null, error };
  }
}

export async function deleteStory(storyId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('❌ No session found for delete');
    return { error: new Error('No session') };
  }

  console.log(`🗑️ Deleting story ${storyId} for user ${session.user.id.substring(0, 8)}...`);

  try {
    // Use backend API to delete (bypasses RLS with admin client)
    const API_URL = import.meta.env.VITE_API_URL ?? '';
    const response = await fetch(`${API_URL}/api/story/${storyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Failed to delete story:', errorData);
      return { error: new Error(errorData.error || 'Failed to delete story') };
    }

    console.log('✅ Story deleted successfully');
    return { error: null };
  } catch (error) {
    console.error('❌ Error deleting story (caught):', error);
    return { error };
  }
}
