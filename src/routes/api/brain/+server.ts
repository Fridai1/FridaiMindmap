import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';

const categories = ['todo', 'thought', 'idea', 'note'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCategory(value: unknown): value is (typeof categories)[number] {
	return typeof value === 'string' && categories.includes(value as (typeof categories)[number]);
}

function finiteNumber(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw error(400, `${field} must be a finite number`);
	}
	return value;
}

export async function POST({ request }) {
	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	if (typeof body.text !== 'string' || !body.text.trim()) {
		throw error(400, 'text is required');
	}
	if (!isCategory(body.category)) {
		throw error(400, 'invalid category');
	}

	const x = finiteNumber(body.x, 'x');
	const y = finiteNumber(body.y, 'y');
	const rotation = finiteNumber(body.rotation, 'rotation');

	const [item] = await db
		.insert(brainItems)
		.values({
			text: body.text.trim(),
			category: body.category,
			dateAdded: new Date().toISOString(),
			x,
			y,
			rotation,
			baseX: x,
			baseY: y
		})
		.returning();

	return json(item, { status: 201 });
}
