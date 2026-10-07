// components/AppShell.tsx
//
// Casca visual da aplicação: barra superior com a marca "SIG Frota", usuário
// logado + "Sair" (Req. 1.5/1.6) e um trilho de navegação (breadcrumb).
//
//  - `BarraSuperior`: só a marca (sem depender de autenticação) — usada também
//    nas telas que não precisam do usuário.
//  - `AppShell`: BarraSuperior + usuário/Sair + conteúdo centralizado.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/** Item do breadcrumb; o último (sem `to`) é a página atual. */
export interface MigalhaItem {
  rotulo: string;
  to?: string;
}

/** Logotipo: gota d'água sobre um "carro" estilizado, em SVG inline. */
function Logo() {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14l1.6-4.4A2 2 0 0 1 8.5 8h7a2 2 0 0 1 1.9 1.6L19 14" />
        <path d="M4 14h16a1 1 0 0 1 1 1v3H3v-3a1 1 0 0 1 1-1z" />
        <circle cx="7.5" cy="18" r="1.5" fill="currentColor" />
        <circle cx="16.5" cy="18" r="1.5" fill="currentColor" />
        <path d="M12 2.5s2 2.3 2 3.5a2 2 0 1 1-4 0c0-1.2 2-3.5 2-3.5z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

/** Barra superior com a marca; `children` renderiza à direita (ex.: usuário). */
export function BarraSuperior({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white shadow-lg shadow-blue-900/20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link to="/veiculos" className="flex items-center gap-3 rounded-lg focus-visible:ring-offset-blue-900">
          <Logo />
          <span className="flex flex-col leading-tight">
            <h1 className="text-lg font-bold tracking-tight">SIG Frota — Lavagens</h1>
            <span className="text-xs text-blue-100/80">Ministério Público Federal</span>
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}

/** Trilho de navegação acessível (`nav aria-label="Você está em"`). */
export function Migalhas({ itens }: { itens: MigalhaItem[] }) {
  return (
    <nav aria-label="Você está em" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-slate-500">
        {itens.map((item, i) => (
          <li key={`${item.rotulo}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">›</span>}
            {item.to ? (
              <Link to={item.to} className="rounded font-medium text-blue-700 hover:underline">
                {item.rotulo}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-slate-700">
                {item.rotulo}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Botão "Voltar": link para a tela anterior lógica (rota fixa, sem depender do histórico). */
export function BotaoVoltar({ to, rotulo }: { to: string; rotulo: string }) {
  return (
    <Link to={to} className="btn-secondary px-3 py-1.5">
      <span aria-hidden="true">←</span>
      {rotulo}
    </Link>
  );
}

/** Linha de navegação: botão voltar à esquerda e breadcrumb ao lado. */
export function BarraNavegacao({
  voltarPara,
  voltarRotulo,
  itens,
}: {
  voltarPara: string;
  voltarRotulo: string;
  itens: MigalhaItem[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <BotaoVoltar to={voltarPara} rotulo={voltarRotulo} />
      <Migalhas itens={itens} />
    </div>
  );
}

/** Iniciais do nome para o avatar do usuário. */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Casca completa: marca + usuário/Sair + conteúdo. */
export function AppShell({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <BarraSuperior>
        {usuario && (
          <div className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-bold ring-1 ring-white/30"
            >
              {iniciais(usuario.nome)}
            </span>
            <span className="flex flex-col text-right leading-tight">
              <span className="font-semibold">{usuario.nome}</span>
              <span className="text-xs text-blue-100/80">{usuario.email}</span>
            </span>
            <button
              type="button"
              onClick={logout /* Req. 1.5 — RequireAuth redireciona ao login. */}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:ring-offset-blue-900"
            >
              Sair
            </button>
          </div>
        )}
      </BarraSuperior>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">{children}</div>
    </div>
  );
}
