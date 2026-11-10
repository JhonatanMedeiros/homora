import { useEffect, useState } from 'react';

export type AuthStatus = { configured: boolean; authenticated: boolean };

/** Estado de acesso: consulta a sessão, cria a conta de administrador e entra ou sai. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<AuthStatus>;
      })
      .then(setStatus)
      .catch(() => setError('Não foi possível conectar ao servidor.'));
  }, []);

  async function submit(password: string) {
    setError('');
    try {
      if (!status?.configured) {
        const setup = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!setup.ok)
          throw new Error('Não foi possível criar a conta. Use pelo menos 8 caracteres.');
        setStatus({ configured: true, authenticated: false });
      }
      const login = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!login.ok)
        throw new Error('Senha inválida ou muitas tentativas. Tente novamente mais tarde.');
      setStatus({ configured: true, authenticated: true });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de conexão.');
      return false;
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setStatus({ configured: true, authenticated: false });
  }

  return { status, error, submit, logout };
}
