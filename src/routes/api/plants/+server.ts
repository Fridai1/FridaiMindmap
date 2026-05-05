import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { plants } from '$lib/server/db/schema';

const lights = ['low', 'medium', 'bright_indirect', 'direct'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isLight(value: unknown): value is (typeof lights)[number] {
	return typeof value === 'string' && lights.includes(value as (typeof lights)[number]);
}

function optionalText(value: unknown, field: string) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') throw error(400, `${field} must be a string`);
	const text = value.trim();
	return text || null;
}

function positiveInteger(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) {
		throw error(400, `${field} must be an integer between 1 and 365`);
	}
	return value;
}

function optionalIsoDate(value: unknown, field: string) {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw error(400, `${field} must be an ISO date string`);
	}
	return new Date(value).toISOString();
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 9).toISOString();
}

export async function POST({ request }) {
	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	if (typeof body.name !== 'string' || !body.name.trim()) throw error(400, 'name is required');
	if (!isLight(body.light)) throw error(400, 'invalid light requirement');

	const wateringIntervalDays = positiveInteger(body.wateringIntervalDays, 'wateringIntervalDays');
	const lastWatered = optionalIsoDate(body.lastWatered, 'lastWatered');
	const nextWatering = lastWatered
		? addDays(new Date(lastWatered), wateringIntervalDays)
		: (optionalIsoDate(body.nextWatering, 'nextWatering') ??
			addDays(new Date(), wateringIntervalDays));
	const waterCount = lastWatered ? 1 : 0;

	const [plant] = await db
		.insert(plants)
		.values({
			name: body.name.trim(),
			species: optionalText(body.species, 'species'),
			light: body.light,
			wateringIntervalDays,
			waterCount,
			lastWatered,
			nextWatering,
			notes: optionalText(body.notes, 'notes'),
			createdAt: new Date().toISOString()
		})
		.returning();

	return json(plant, { status: 201 });
}
