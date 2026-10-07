// auth/LoginPage.tsx
//
// Tela de login (Req. 1.1, 1.2). Formulário acessível (Req. 10.2/10.3) que
// autentica via `useAuth().login()` — abstraído atrás do `AuthAdapter`
// mockável (MockAuthAdapter no MVP). Em sucesso, navega para a rota pretendida
// preservada por `RequireAuth` em `location.state.from` (Req. 1.1), ou para uma
// rota padrão. Em erro de credenciais, exibe a mensagem sem travar a aplicação.
//
// Acessibilidade:
//  - cada campo tem `label` associado por `htmlFor`/`id`;
//  - erro de credenciais é anunciado via região com `role="alert"` e vinculado
//    aos campos por `aria-describedby`; os campos recebem `aria-invalid`;
//  - o botão de envio é desabilitado enquanto a autenticação está em andamento,
//    evitando envio duplicado.

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth } from './useAuth';
import { CredenciaisInvalidasError } from './MockAuthAdapter';

/** Rota padrão pós-login quando não há destino pretendido (Req. 1.1). */
export const ROTA_PADRAO_POS_LOGIN = '/veiculos';

interface LocationState {
  from?: Location;
}

interface LoginPageProps {
  /**
   * Rota de destino quando não há `location.state.from`. Default:
   * `ROTA_PADRAO_POS_LOGIN`. Injetável para facilitar testes.
   */
  rotaPadrao?: string;
}

export function LoginPage({ rotaPadrao = ROTA_PADRAO_POS_LOGIN }: LoginPageProps) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [autenticando, setAutenticando] = useState(false);

  // Destino pretendido preservado por RequireAuth (Req. 1.1).
  const destino =
    (location.state as LocationState | null)?.from?.pathname ?? rotaPadrao;

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (autenticando) return;

    setErro(null);
    setAutenticando(true);
    try {
      // Req. 1.2: autentica e, no sucesso, o provider armazena o token.
      await login({ email, senha });
      // Req. 1.1/1.2: navega para o destino pretendido ou rota padrão.
      navigate(destino, { replace: true });
    } catch (e) {
      // Erro de credenciais: exibe mensagem sem travar a app (Req. 1.2).
      if (e instanceof CredenciaisInvalidasError) {
        setErro(e.message);
      } else {
        setErro('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setAutenticando(false);
    }
  }

  const temErro = erro !== null;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca (decorativo; some em telas estreitas). */}
      <aside
        aria-hidden="true"
        className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-blue-600 p-12 text-white lg:flex"
      >
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
        <p className="relative text-sm font-semibold uppercase tracking-widest text-blue-100">
          Ministério Público Federal
        </p>
        <div className="relative">
          <p className="text-5xl font-extrabold leading-tight tracking-tight">
            SIG Frota
            <span className="block text-blue-200">Módulo de Lavagem</span>
          </p>
          <p className="mt-4 max-w-md text-lg text-blue-100/90">
            Registre e acompanhe as lavagens da frota com regras validadas e
            histórico por veículo.
          </p>
        </div>
        <p className="relative text-xs text-blue-100/70">
          Hackathon AWS × MPF · dados fictícios
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="card flex w-full max-w-sm flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Acesse o módulo de lavagem do SIG Frota.
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={aoEnviar} noValidate>
        {temErro && (
          <div
            id="erro-login"
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {erro}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={temErro}
            aria-describedby={temErro ? 'erro-login' : undefined}
            disabled={autenticando}
            className="input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="senha" className="text-sm font-medium text-slate-700">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={temErro}
            aria-describedby={temErro ? 'erro-login' : undefined}
            disabled={autenticando}
            className="input"
          />
        </div>

        <button
          type="submit"
          disabled={autenticando}
          className="btn-primary mt-2 py-2.5"
        >
          {autenticando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
        </div>
      </main>
    </div>
  );
}
