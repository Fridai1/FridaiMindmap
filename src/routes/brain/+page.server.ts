import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';

export async function load() {
	const items = await db.select().from(brainItems);
	return { items };
}
