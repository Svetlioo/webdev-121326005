'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/src/auth-client';
import { authMessage } from '@/src/auth-messages';

/** "Свържи Google": links a Google account to the signed-in user (SPEC.md, Auth, Linking). */
export function LinkGoogleButton() {
  const [error, setError] = useState('');
  async function onClick() {
    setError('');
    const { error } = await authClient.linkSocial({ provider: 'google', callbackURL: '/week', errorCallbackURL: '/week' });
    if (error) setError(authMessage(error.code));
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={onClick}>
        Свържи Google
      </Button>
    </span>
  );
}
