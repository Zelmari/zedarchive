"use server";

import { db } from "@/lib/db";
import { mediaEntries } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function addMediaEntry(formData) {
  const title = formData.get("title");
  const type = formData.get("type");
  const currentProgress = parseInt(formData.get("currentProgress") || "0", 10);
  const totalUnits = formData.get("totalUnits")
    ? parseInt(formData.get("totalUnits"), 10)
    : null;
  const status = formData.get("status") || "in_progress";

  if (!title) return;

  await db.insert(mediaEntries).values({
    title,
    type,
    currentProgress,
    totalUnits,
    status,
  });

  revalidatePath("/");
}
