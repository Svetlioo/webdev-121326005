'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/src/auth-client';
import { authMessage } from '@/src/auth-messages';

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // After a refused Google sign-in, Better Auth sends the person back here with ?error=...
  const googleError = useSearchParams().get('error');
  const [error, setError] = useState(googleError ? authMessage(googleError) : '');
  const [busy, setBusy] = useState(false);
  const signingIn = mode === 'signin';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    setError('');
    const { error } = signingIn
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name: email.split('@')[0] });
    setBusy(false);
    if (error) return setError(authMessage(error.code));
    router.push('/week');
    router.refresh();
  }

  async function withGoogle() {
    setError('');
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/week', errorCallbackURL: '/signin' });
    if (error) setError(authMessage(error.code));
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          ТУ София · <span className="text-foreground">Седмично разписание</span>
        </p>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{signingIn ? 'Вход' : 'Нов профил'}</h1>
            </CardTitle>
            <CardDescription>
              {signingIn ? 'Влезте с имейла и паролата си.' : 'Паролата трябва да е поне 8 знака.'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Имейл</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Парола</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={signingIn ? 'current-password' : 'new-password'}
                  minLength={signingIn ? undefined : 8}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="mt-6 flex-col gap-3">
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Моля, изчакайте…' : signingIn ? 'Вход' : 'Създай профил'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="text-muted-foreground"
                onClick={() => {
                  setMode(signingIn ? 'signup' : 'signin');
                  setError('');
                }}
              >
                {signingIn ? 'Нямате профил? Регистрирайте се' : 'Имате профил? Влезте'}
              </Button>
              <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                или
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={withGoogle}>
                Вход с Google
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
