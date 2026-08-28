export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
