import type { Value } from './model.ts';

export function restDurationSeconds(goals: Record<string, Value>): number {
  const seconds = goals.restSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 30 && seconds <= 1800
    ? Math.round(seconds) : 90;
}

export function workoutDurationSeconds(workout: Record<string, Value>, now: number): number | null {
  if (workout.status === 'completed') {
    const seconds = workout.durationSeconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds);
    const minutes = workout.duration;
    return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : null;
  }
  const startedAt = workout.startedAt;
  return workout.status === 'active' && typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0
    ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
}

export function formatWorkoutTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function completedWorkoutTiming(workout: Record<string, Value>, now: number) {
  const seconds = workoutDurationSeconds(workout, now);
  if (workout.status !== 'active' || seconds === null) throw new Error('Nejdřív spusť trénink tlačítkem Začít trénink.');
  return {status: 'completed', durationSeconds: seconds, duration: Math.max(1, Math.round(seconds / 60)), finishedAt: now};
}
