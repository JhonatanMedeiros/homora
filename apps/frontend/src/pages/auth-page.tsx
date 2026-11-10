import { useState, type FormEvent } from 'react';
import type { AuthStatus } from '@/hooks/use-auth';
import { BrandMark } from '@/components/brand-mark';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  status: AuthStatus | null;
  error: string;
  onSubmit: (password: string) => Promise<boolean>;
};

/** Criação da conta de administrador e entrada. */
export function AuthPage({ status, error, onSubmit }: Props) {
  const [password, setPassword] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await onSubmit(password)) setPassword('');
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandMark className="self-center text-2xl" />
        <Card>
          {status ? (
            <>
              <CardHeader>
                <h1 className="text-2xl">
                  {status.configured ? 'Bem-vindo de volta.' : 'Crie sua senha.'}
                </h1>
                <CardDescription>
                  {status.configured
                    ? 'Entre para acessar seus serviços.'
                    : 'Configure o acesso de administrador deste Homora.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void submit(e)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="password">Senha</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={1024}
                        autoComplete={status.configured ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                    <FormError>{error}</FormError>
                    <Button type="submit">{status.configured ? 'Entrar' : 'Criar conta'}</Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </>
          ) : (
            <CardContent>
              <p role="status" className="flex items-center gap-2 text-muted-foreground">
                {!error && <Spinner />}
                {error || 'Conectando...'}
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
