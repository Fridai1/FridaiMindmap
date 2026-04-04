import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) error(400, 'invalid id');

	const body = await request.json();

	// Only allow updating safe fields
	const allowed = ['x', 'y', 'baseX', 'baseY', 'rotation', 'text', 'category'] as const;
	const update: Partial<Record<(typeof allowed)[number], unknown>> = {};
	for (const key of allowed) {
		if (key in body) update[key] = body[key];
	}

	if (Object.keys(update).length === 0) error(400, 'nothing to update');

	await db.update(brainItems).set(update).where(eq(brainItems.id, id));
	return json({ ok: true });
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) error(400, 'invalid id');

	await db.delete(brainItems).where(eq(brainItems.id, id));
	return json({ ok: true });
}
