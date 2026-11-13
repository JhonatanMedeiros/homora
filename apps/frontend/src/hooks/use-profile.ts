import { useEffect, useState } from 'react';
import type { Profile } from '@/features/account/account-model';

/** Name and email of the signed-in account, for the user menu and the Account page. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/account')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Partial<Profile> | null>;
      })
      .then((data) => {
        if (typeof data?.name !== 'string' || typeof data.email !== 'string') throw new Error();
        if (active)
          setProfile({
            name: data.name,
            email: data.email,
            twoFactorEnabled: data.twoFactorEnabled === true,
          });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { profile, failed, setProfile };
}
