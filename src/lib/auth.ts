import type { SupabaseClient } from '@supabase/supabase-js';
export type AuthMode = 'signin' | 'signup' | 'reset' | 'update';
export type AuthInput = { email: string; password: string; confirmation: string; name: string };
export function validateAuth(mode: AuthMode, input: AuthInput) {
  const email = input.email.trim();
  if (mode !== 'update' && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Zadej platný e-mail.');
  if (mode === 'signin' && !input.password) throw new Error('Zadej svoje heslo.');
  if ((mode === 'signup' || mode === 'update') && input.password.length < 8) throw new Error('Heslo musí mít alespoň 8 znaků.');
  if ((mode === 'signup' || mode === 'update') && input.password !== input.confirmation) throw new Error('Hesla se neshodují.');
  if (mode === 'signup' && (!input.name.trim() || input.name.trim().length > 80)) throw new Error('Zadej jméno do 80 znaků.');
  return { ...input, email, name: input.name.trim() };
}
export function authError(error: { message?: string; code?: string; status?: number }) {
  if (error.code === 'invalid_credentials') return 'E-mail nebo heslo není správně.';
  if (error.code === 'email_not_confirmed') return 'Nejdřív potvrď svůj e-mail. Potvrzení najdeš ve své poště.';
  if (error.status === 429 || error.code?.includes('rate_limit')) return 'Požadavků je teď moc. Zkus to za chvíli znovu.';
  if (/fetch|network|timeout|abort/i.test(error.message || '')) return 'Spojení se nepodařilo. Zkontroluj internet a zkus to znovu.';
  if (error.code === 'weak_password') return 'Zvol silnější heslo, které splňuje požadavky účtu.';
  return 'Akci se nepodařilo dokončit. Zkus to znovu.';
}
export function createAuthSignal(ready: boolean) {
  let value = { ready, recovery: false };
  const listeners = new Set<() => void>();
  return { getSnapshot: () => value, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set: (patch: Partial<typeof value>) => { value = { ...value, ...patch }; for (const fn of listeners) fn(); } };
}
export type AuthApi = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signUp' | 'resetPasswordForEmail' | 'updateUser'>;
export async function executeAuth(api: AuthApi, mode: AuthMode, raw: AuthInput, redirectTo: string) {
  const input = validateAuth(mode, raw);
  if (mode === 'signin') {
    const { data, error } = await api.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw error;
    if (!data.session) throw new Error('Session not returned');
    return { signedIn: true, emailSent: false };
  }
  if (mode === 'signup') {
    const { data, error } = await api.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: redirectTo, data: { display_name: input.name } } });
    if (error) throw error;
    return { signedIn: Boolean(data.session), emailSent: !data.session };
  }
  if (mode === 'reset') {
    const { error } = await api.resetPasswordForEmail(input.email, { redirectTo });
    if (error) throw error;
    return { signedIn: false, emailSent: true };
  }
  const { error } = await api.updateUser({ password: input.password });
  if (error) throw error;
  return { signedIn: true, emailSent: false };
}
