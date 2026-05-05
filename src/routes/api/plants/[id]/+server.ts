import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { plants, type NewPlant } from '$lib/server/db/schema';

type PlantUpdate = Partial<
	Pick<
		NewPlant,
		| 'name'
		| 'species'
		| 'light'
		| 'wateringIntervalDays'
		| 'waterCount'
		| 'lastWatered'
		| 'nextWatering'
		| 'notes'
	>
>;

const lights = ['low', 'medium', 'bright_indirect', 'direct'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 9).toISOString();
}

function validateText(value: unknown, field: string) {
	if (typeof value !== 'string' || !value.trim()) throw error(400, `${field} is required`);
	return value.trim();
}

function validateOptionalText(value: unknown, field: string) {
	if (value === null) return null;
	if (typeof value !== 'string') throw error(400, `${field} must be a string or null`);
	const text = value.trim();
	return text || null;
}

function validateLight(value: unknown) {
	if (typeof value !== 'string' || !lights.includes(value as (typeof lights)[number])) {
		throw error(400, 'invalid light requirement');
	}
	return value as (typeof lights)[number];
}

function validateInterval(value: unknown) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) {
		throw error(400, 'wateringIntervalDays must be an integer between 1 and 365');
	}
	return value;
}

function validateOptionalIsoDate(value: unknown, field: string) {
	if (value === null) return null;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw error(400, `${field} must be an ISO date string or null`);
	}
	return new Date(value).toISOString();
}

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (Number.isNaN(id)) throw error(400, 'invalid id');

	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	const update: PlantUpdate = {};
	if ('name' in body) update.name = validateText(body.name, 'name');
	if ('species' in body) update.species = validateOptionalText(body.species, 'species');
	if ('light' in body) update.light = validateLight(body.light);
	if ('wateringIntervalDays' in body)
		update.wateringIntervalDays = validateInterval(body.wateringIntervalDays);
	if ('lastWatered' in body)
		update.lastWatered = validateOptionalIsoDate(body.lastWatered, 'lastWatered');
	if ('nextWatering' in body)
		update.nextWatering = validateOptionalIsoDate(body.nextWatering, 'nextWatering') ?? undefined;
	if ('notes' in body) update.notes = validateOptionalText(body.notes, 'notes');

	if (body.wateredToday === true) {
		const [plant] = await db.select().from(plants).where(eq(plants.id, id)).limit(1);
		if (!plant) throw error(404, 'plant not found');
		const wateredAt = new Date();
		update.lastWatered = wateredAt.toISOString();
		update.nextWatering = addDays(wateredAt, plant.wateringIntervalDays);
		update.waterCount = (plant.waterCount ?? 0) + 1;
	}

	if (Object.keys(update).length === 0) throw error(400, 'nothing to update');

	const [plant] = await db.update(plants).set(update).where(eq(plants.id, id)).returning();
	if (!plant) throw error(404, 'plant not found');
	return json(plant);
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (Number.isNaN(id)) throw error(400, 'invalid id');

	await db.update(plants).set({ deletedAt: new Date().toISOString() }).where(eq(plants.id, id));
	return json({ ok: true });
}
