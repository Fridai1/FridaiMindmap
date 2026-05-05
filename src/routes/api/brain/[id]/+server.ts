import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { brainItems, type NewBrainItem } from '$lib/server/db/schema';

const categories = ['todo', 'thought', 'idea', 'note'] as const;

type BrainItemUpdate = Partial<
	Pick<NewBrainItem, 'text' | 'category' | 'x' | 'y' | 'rotation' | 'baseX' | 'baseY'>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCategory(value: unknown): value is (typeof categories)[number] {
	return typeof value === 'string' && categories.includes(value as (typeof categories)[number]);
}

function validateNumber(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw error(400, `${field} must be a finite number`);
	}
	return value;
}

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	const update: BrainItemUpdate = {};

	if ('text' in body) {
		if (typeof body.text !== 'string' || !body.text.trim()) throw error(400, 'text is required');
		update.text = body.text.trim();
	}
	if ('category' in body) {
		if (!isCategory(body.category)) throw error(400, 'invalid category');
		update.category = body.category;
	}
	if ('x' in body) update.x = validateNumber(body.x, 'x');
	if ('y' in body) update.y = validateNumber(body.y, 'y');
	if ('baseX' in body) update.baseX = validateNumber(body.baseX, 'baseX');
	if ('baseY' in body) update.baseY = validateNumber(body.baseY, 'baseY');
	if ('rotation' in body) update.rotation = validateNumber(body.rotation, 'rotation');

	if (Object.keys(update).length === 0) throw error(400, 'nothing to update');

	await db.update(brainItems).set(update).where(eq(brainItems.id, id));
	return json({ ok: true });
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	await db.delete(brainItems).where(eq(brainItems.id, id));
	return json({ ok: true });
}
