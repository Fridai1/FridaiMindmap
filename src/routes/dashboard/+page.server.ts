import { asc, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { brainItems, plants } from '$lib/server/db/schema';

export async function load() {
	const [items, plantRows] = await Promise.all([
		db.select().from(brainItems).where(isNull(brainItems.deletedAt)),
		db.select().from(plants).where(isNull(plants.deletedAt)).orderBy(asc(plants.nextWatering))
	]);

	return { items, plants: plantRows };
}
