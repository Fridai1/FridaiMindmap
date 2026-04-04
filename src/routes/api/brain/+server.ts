import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';

export async function POST({ request }) {
	const body = await request.json();

	if (!body.text?.trim()) {
		error(400, 'text is required');
	}
	if (!['todo', 'thought', 'idea', 'note'].includes(body.category)) {
		error(400, 'invalid category');
	}

	const [item] = await db
		.insert(brainItems)
		.values({
			text: body.text.trim(),
			category: body.category,
			dateAdded: new Date().toISOString(),
			x: body.x,
			y: body.y,
			rotation: body.rotation,
			baseX: body.x,
			baseY: body.y
		})
		.returning();

	return json(item, { status: 201 });
}
