export const CATEGORIES = ['todo', 'thought', 'idea', 'note'] as const;
export const PRIORITIES = [1, 2, 3] as const;
export const RECURRENCES = ['daily', 'weekly', 'monthly'] as const;
export const PROJECT_COLUMNS = ['backlog', 'next', 'doing', 'done'] as const;
export const LIGHTS = ['low', 'medium', 'bright_indirect', 'direct'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type ProjectColumn = (typeof PROJECT_COLUMNS)[number];
export type Light = (typeof LIGHTS)[number];

export function addDaysAtHour(date: Date, days: number, hour: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, hour);
}

export function nextRecurringDeadline(from: Date, recurrence: Recurrence) {
	const days = recurrence === 'daily' ? 1 : recurrence === 'weekly' ? 7 : 30;
	return addDaysAtHour(from, days, 12);
}

export function nextWateringDate(from: Date, wateringIntervalDays: number) {
	return addDaysAtHour(from, wateringIntervalDays, 9);
}
