'use server';

import { headers } from 'next/headers';
import { eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
  mediaEntries,
  mediaActivityLogs,
  profileComments,
} from '@/db/schema';
import { getAuthUser } from './internal';
import { deleteAccountSchema } from '@/lib/validations/auth';

export interface DeleteAccountInput {
  password?: string;
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthUser();
  const reqHeaders = await headers();

  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success || !parsed.data.password) {
    return { success: false, error: 'Password is required to delete your account.' };
  }
  const { password } = parsed.data;

  // Verify credential via better-auth signInEmail endpoint
  try {
    const signInRes = await auth.api.signInEmail({
      body: {
        email: user.email || '',
        password,
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

    // 6. Delete Better Auth verification tokens. The verification table is a
    // polymorphic key-value store without a foreign key to `user`, so the
    // user-row cascade can never reach it. Password-reset tokens store
    // user.id in `value`; legacy flows may store the email in either column.
    const verificationConditions = [
      eq(verificationTable.value, user.id),
      eq(verificationTable.identifier, user.id),
    ];
    if (user.email) {
      verificationConditions.push(
        eq(verificationTable.identifier, user.email),
        eq(verificationTable.value, user.email),
      );
    }
    await tx.delete(verificationTable).where(or(...verificationConditions));

    // 7. Delete user record
    await tx.delete(userTable).where(eq(userTable.id, user.id));
  });

  return { success: true };
}
