import { isMinimumAppVersionMet } from './minimum-app-version';
import { supabase } from './supabase';

export type RemoteAppVersionPolicy = {
  enforced: boolean;
  minimumIosVersion: string;
  storeUrl: string;
};

export async function loadIosVersionPolicy(): Promise<RemoteAppVersionPolicy> {
  const { data, error } = await supabase
    .from('app_version_policies')
    .select('minimum_version,store_url,enforced')
    .eq('platform', 'ios')
    .single();
  if (error || !data) throw error ?? new Error('App version policy is unavailable.');
  return {
    enforced: data.enforced,
    minimumIosVersion: data.minimum_version,
    storeUrl: data.store_url,
  };
}

export async function resolveAppVersionPolicy(
  currentIosVersion: string,
  load: () => Promise<RemoteAppVersionPolicy>,
): Promise<{ blocked: boolean; storeUrl?: string }> {
  try {
    const policy = await load();
    if (!policy.enforced || isMinimumAppVersionMet(currentIosVersion, policy.minimumIosVersion)) {
      return { blocked: false };
    }
    return { blocked: true, storeUrl: policy.storeUrl };
  } catch {
    return { blocked: false };
  }
}
