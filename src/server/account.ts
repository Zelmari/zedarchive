'use server';

import { headers } from 'next/headers';
import { eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  mediaEntries,
  mediaActivityLogs,
  profileComments,
} from '@/db/schema';
import { getAuthUser } from './internal';

export interface DeleteAccountInput {
  password?: string;
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthUser();
  const reqHeaders = await headers();

  if (!input.password) {
    return { success: false, error: 'Password is required to delete your account.' };
  }

  // Verify credential via better-auth signInEmail endpoint
  try {
    const signInRes = await auth.api.signInEmail({
      body: {
        email: user.email || '',
        password: input.password,
      },
      headers: reqHeaders,
    });

    if (!signInRes?.user) {
      return { success: false, error: 'Incorrect password. Account deletion aborted.' };
    }
  } catch {
    return { success: false, error: 'Incorrect password. Account deletion aborted.' };
  }

  // Atomic database wipe across all related tables
  await db.transaction(async (tx) => {
    // 1. Delete comments where user is author or profile owner
    await tx
      .delete(profileComments)
      .where(
        or(eq(profileComments.profileUserId, user.id), eq(profileComments.authorUserId, user.id)),
      );

    // 2. Delete activity logs
    await tx.delete(mediaActivityLogs).where(eq(mediaActivityLogs.userId, user.id));

    // 3. Delete media entries
    await tx.delete(mediaEntries).where(eq(mediaEntries.userId, user.id));

    // 4. Delete account records
    await tx.delete(accountTable).where(eq(accountTable.userId, user.id));

    // 5. Delete active sessions
    await tx.delete(sessionTable).where(eq(sessionTable.userId, user.id));

    // 6. Delete user record
    await tx.delete(userTable).where(eq(userTable.id, user.id));
  });

  return { success: true };
}
