'use server';

import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { revalidatePath } from 'next/cache';

export async function addMediaEntry(formData) {
  const title = formData.get('title');
  const category = formData.get('category') || 'show';
  const secondaryUnitCurrent = parseInt(formData.get('currentProgress') || formData.get('secondaryUnitCurrent') || '0', 10);
  const secondaryUnitTotal = formData.get('totalUnits') || formData.get('secondaryUnitTotal')
    ? parseInt(formData.get('totalUnits') || formData.get('secondaryUnitTotal'), 10)
    : null;

  if (!title) return;

  await db.insert(mediaEntries).values({
    id: crypto.randomUUID(),
    title,
    category,
    secondaryUnitCurrent,
    secondaryUnitTotal,
  });

  revalidatePath('/');
}
