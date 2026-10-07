'use server';

import { eq, or, and, ne } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { db } from '@/lib/db';
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
  mediaEntries,
  mediaActivityLogs,
  profileComments,
  assistantUsage,
  ASSISTANT_FLEET_USER_ID,
} from '@/db/schema';
import { getAuthUser } from './internal';
import { deleteAccountSchema } from '@/lib/validations/auth';

interface DeleteAccountInput {
  password?: string;
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthUser();

  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success || !parsed.data.password) {
    return { success: false, error: 'Password is required to delete your account.' };
  }
  const { password } = parsed.data;

  const [credential] = await db
    .select({ password: accountTable.password })
    .from(accountTable)
    .where(and(eq(accountTable.userId, user.id), eq(accountTable.providerId, 'credential')))
    .limit(1);

  if (!credential?.password) {
    return { success: false, error: 'Password is required to delete your account.' };
  }

  let passwordMatches = false;
  try {
    passwordMatches = await verifyPassword({ hash: credential.password, password });
  } catch {
    passwordMatches = false;
  }
  if (!passwordMatches) {
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

    // 4. Usage has no user FK, so the user-row cascade cannot reach it.
    //    Skip the global "__fleet__" row. Proposals and events cascade below.
    await tx
      .delete(assistantUsage)
      .where(
        and(eq(assistantUsage.userId, user.id), ne(assistantUsage.userId, ASSISTANT_FLEET_USER_ID)),
      );

    // 5. Delete account records
    await tx.delete(accountTable).where(eq(accountTable.userId, user.id));

    // 6. Delete active sessions
    await tx.delete(sessionTable).where(eq(sessionTable.userId, user.id));

    // 7. Delete Better Auth verification tokens. The verification table is a
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

    // 8. Delete user record. Proposals and events cascade with this row.
    await tx.delete(userTable).where(eq(userTable.id, user.id));
  });

  return { success: true };
}
