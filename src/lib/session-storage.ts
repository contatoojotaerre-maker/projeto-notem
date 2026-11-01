import { brokeredPreviewStorage } from '@/integrations/supabase/previewAuthStorage';

export function sessionStorageAdapter() {
  if (typeof window === 'undefined') return undefined;
  const persistent = brokeredPreviewStorage();
  return {
    async getItem(key:string) { return sessionStorage.getItem('notem-session-only')==='true' ? sessionStorage.getItem(key) : await persistent?.getItem(key) ?? null; },
    async setItem(key:string,value:string) { if(sessionStorage.getItem('notem-session-only')==='true') {sessionStorage.setItem(key,value);await persistent?.removeItem(key);} else {await persistent?.setItem(key,value);sessionStorage.removeItem(key);} },
    async removeItem(key:string) {sessionStorage.removeItem(key);await persistent?.removeItem(key);},
  };
}