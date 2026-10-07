// features/lavagem/LavagemFormPage.tsx
//
// HOST do formulário de lavagem (Req. 3/8/9) — destino das rotas:
//
//   /veiculos/:idVeiculo/lavagens/nova        → modo INCLUSÃO (R22 / Req. 3.2)
//   /veiculos/:idVeiculo/lavagens/:idLavagem  → modo EDIÇÃO   (R21 / Req. 3.3)
//
// Esta página NÃO conhece a lógica condicional do formulário (isso vive em
// `LavagemForm` + `camposCondicionais`); ela apenas:
//
//  1. Lê os parâmetros de rota (`:idVeiculo` sempre; `:idLavagem` só na edição)
//     e os converte para number de forma segura (NaN → id inválido).
//  2. Deriva o MODO pela presença de `idLavagem` (Req. 3.4 — deixa claro na UI
//     via título "Nova lavagem" / "Editar lavagem").
//  3. Na EDIÇÃO, carrega a lavagem por `idLavagem` (R21) com TanStack Query:
//     enquanto carrega, mostra Spinner; em erro, ErrorState; quando pronta,
//     passa como `valoresIniciais` ao `LavagemForm`.
//  4. Liga o `onSubmit` do formulário às mutações (`useLavagemMutations`):
//     - inclusão: `criar.mutateAsync(payload)` (R17/Req. 8.1);
//     - edição:   `atualizar.mutateAsync({ id, dados: payload })` (R17/Req. 8.2).
//     No SUCESSO, navega de volta para `/veiculos/:idVeiculo` com
//     `state: { sucesso }` — a `VeiculoPage` (tarefa 5.3) exibe o toast a partir
//     de `location.state.sucesso` (shape `VeiculoPageState`). R18/R23.
//
//  5. Estados de salvamento (tarefa 8.3 / Req. 8.6/8.7):
//     - ENQUANTO salva (Req. 8.6): passa `enviando={criar.isPending}` (ou
//       `atualizar.isPending`) ao `LavagemForm`, que desabilita o botão e indica
//       o progresso — evitando envio duplicado.
//     - QUANDO falha (Req. 8.7): o `aoEnviar` async captura o erro em `catch`,
//       NÃO navega (o formulário continua montado, preservando os dados
//       preenchidos) e exibe um toast de erro (`useToast`) permitindo nova
//       tentativa (o botão volta a habilitar quando a mutação sai de `isPending`).
//
// Fora de escopo aqui (pontos de extensão deixados explícitos):
//  - 8.4: exclusão com `ConfirmDeleteDialog` — ver marcador abaixo no modo edição.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Lavagem } from '../../api/types';
import { useLavagemClient } from '../../app/LavagemClientProvider';
import { useToast } from '../../app/ToastRegion';
import type { ValoresFormularioLavagem } from '../../lib/validationResolver';
import type { VeiculoPageState } from '../veiculo/VeiculoPage';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { LavagemForm } from './LavagemForm';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useLavagemMutations } from './useLavagemMutations';

/** Modo do formulário, derivado da presença de `:idLavagem` na rota. */
export type ModoLavagemForm = 'inclusao' | 'edicao';

/** Query key da lavagem individual (modo edição — R21). */
export function lavagemQueryKey(idLavagem: number) {
  return ['lavagem', idLavagem] as const;
}

/** Converte um parâmetro de rota (string) para number, tratando ausência/NaN. */
function paramParaNumero(valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Página host do formulário. Lê os params ela mesma e deriva o modo — o router
 * não precisa passar prop de modo.
 */
export function LavagemFormPage() {
  const { idVeiculo: idVeiculoParam, idLavagem: idLavagemParam } = useParams();
  const navigate = useNavigate();

  const idVeiculo = paramParaNumero(idVeiculoParam);
  const idLavagem = paramParaNumero(idLavagemParam);

  // O modo é EDIÇÃO quando a rota traz `:idLavagem` (R21); senão, INCLUSÃO (R22).
  const modo: ModoLavagemForm =
    idLavagemParam !== undefined ? 'edicao' : 'inclusao';
  const titulo = modo === 'edicao' ? 'Editar lavagem' : 'Nova lavagem';

  // Guarda: `:idVeiculo` é obrigatório em ambos os modos. Sem um id válido não
  // há como associar/salvar a lavagem (R02) nem voltar ao painel.
  if (idVeiculo === undefined) {
    return (
      <LayoutFormulario titulo={titulo}>
        <p role="alert" className="text-sm text-red-700">
          Veículo inválido. Verifique o endereço e tente novamente.
        </p>
      </LayoutFormulario>
    );
  }

  // Na edição, `:idLavagem` precisa ser um número válido para o carregamento.
  if (modo === 'edicao' && idLavagem === undefined) {
    return (
      <LayoutFormulario titulo={titulo}>
        <p role="alert" className="text-sm text-red-700">
          Lavagem inválida. Verifique o endereço e tente novamente.
        </p>
      </LayoutFormulario>
    );
  }

  return (
    <LayoutFormulario titulo={titulo}>
      {modo === 'edicao' ? (
        <FormularioEdicao
          idVeiculo={idVeiculo}
          idLavagem={idLavagem!}
          onSucesso={(mensagem) => voltarAoPainel(idVeiculo, mensagem)}
        />
      ) : (
        <FormularioInclusao
          idVeiculo={idVeiculo}
          onSucesso={(mensagem) => voltarAoPainel(idVeiculo, mensagem)}
        />
      )}
    </LayoutFormulario>
  );

  /**
   * Volta ao painel do veículo com a mensagem de sucesso no `state`
   * (R18/R23). A `VeiculoPage` lê `state.sucesso` e exibe o toast.
   */
  function voltarAoPainel(idVeic: number, sucesso: string) {
    const state: VeiculoPageState = { sucesso };
    navigate(`/veiculos/${idVeic}`, { state });
  }
}

/** Casca visual comum (cabeçalho com o título do modo) — Req. 3.4. */
function LayoutFormulario({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-800">{titulo}</h1>
      </header>
      {children}
    </main>
  );
}

/**
 * Modo INCLUSÃO (R22 / Req. 3.2/3.4): renderiza o formulário SEM valores
 * iniciais (usa os defaults de domínio — interna/conveniado). No sucesso de
 * `criar`, volta ao painel com a mensagem de inclusão.
 */
function FormularioInclusao({
  idVeiculo,
  onSucesso,
}: {
  idVeiculo: number;
  onSucesso: (mensagem: string) => void;
}) {
  const { criar } = useLavagemMutations(idVeiculo);
  const { mostrarToast } = useToast();

  async function aoEnviar(payload: Lavagem) {
    try {
      await criar.mutateAsync(payload); // R17 (POST) / Req. 8.1
      onSucesso('Lavagem incluída com sucesso'); // R18
    } catch {
      // Req. 8.7: falha mantém os dados (não navega → form segue montado) e
      // exibe o erro via toast, permitindo nova tentativa.
      mostrarToast(
        'Não foi possível salvar a lavagem. Tente novamente.',
        'erro',
      );
    }
  }

  // Req. 8.6: enquanto `criar` está em andamento, o botão fica desabilitado e
  // indica o progresso, evitando envio duplicado.
  return (
    <LavagemForm
      idVeiculo={idVeiculo}
      onSubmit={aoEnviar}
      enviando={criar.isPending}
    />
  );
}

/**
 * Modo EDIÇÃO (R21 / Req. 3.3/3.4): carrega a lavagem por `idLavagem`
 * (Spinner enquanto carrega; ErrorState em falha) e, quando pronta, passa como
 * `valoresIniciais` ao formulário. No sucesso de `atualizar`, volta ao painel
 * com a mensagem de alteração.
 */
function FormularioEdicao({
  idVeiculo,
  idLavagem,
  onSucesso,
}: {
  idVeiculo: number;
  idLavagem: number;
  onSucesso: (mensagem: string) => void;
}) {
  const client = useLavagemClient();
  const { atualizar, excluir } = useLavagemMutations(idVeiculo);
  const { mostrarToast } = useToast();

  // Controla a abertura do ConfirmDeleteDialog (Req. 9.2). O botão "Excluir"
  // abre; confirmar/cancelar/Esc fecham conforme o fluxo (Req. 9.3/9.4/9.5).
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  // Carrega a lavagem a editar (R21). Usa o client diretamente via useQuery.
  const consulta = useQuery<Lavagem, Error>({
    queryKey: lavagemQueryKey(idLavagem),
    queryFn: () => client.obterLavagem(idVeiculo, idLavagem),
  });

  if (consulta.isPending) {
    return <Spinner label="Carregando lavagem..." />;
  }

  if (consulta.isError) {
    return (
      <ErrorState
        mensagem="Não foi possível carregar a lavagem para edição."
        onRetry={() => consulta.refetch()}
      />
    );
  }

  // A entidade `Lavagem` é compatível com os valores do formulário
  // (`ValoresFormularioLavagem` = recorte de `LavagemInput`); o `idLavagem` é
  // preservado por `montarPayloadLavagem` no envio (PUT).
  const valoresIniciais = consulta.data as Partial<ValoresFormularioLavagem>;

  async function aoEnviar(payload: Lavagem) {
    try {
      await atualizar.mutateAsync({ id: idLavagem, dados: payload }); // R17 (PUT) / Req. 8.2
      onSucesso('Lavagem alterada com sucesso'); // R18
    } catch {
      // Req. 8.7: falha mantém os dados (não navega) e mostra o toast de erro,
      // permitindo nova tentativa.
      mostrarToast(
        'Não foi possível salvar a lavagem. Tente novamente.',
        'erro',
      );
    }
  }

  /**
   * Confirma a exclusão (Req. 9.3): chama `excluir.mutateAsync(idLavagem)` e,
   * no sucesso, volta ao painel com a mensagem (R18 — a VeiculoPage mostra o
   * toast e a lista re-busca sem a lavagem, R17/R23). Em falha (Req. 9.5),
   * mantém a lavagem (não navega), fecha o diálogo e exibe o toast de erro.
   */
  async function confirmarExclusao() {
    try {
      await excluir.mutateAsync(idLavagem); // R17 (DELETE)
      onSucesso('Lavagem excluída com sucesso'); // R18
    } catch {
      // Req. 9.5: a lavagem permanece (não navega). Fecha o diálogo e informa o
      // erro por toast, mantendo o formulário para nova tentativa.
      setConfirmandoExclusao(false);
      mostrarToast(
        'Não foi possível excluir a lavagem. Tente novamente.',
        'erro',
      );
    }
  }

  return (
    <>
      <LavagemForm
        idVeiculo={idVeiculo}
        valoresIniciais={valoresIniciais}
        onSubmit={aoEnviar}
        enviando={atualizar.isPending}
      />

      {/* Tarefa 8.4 / Req. 9.1: ação "Excluir" disponível apenas no modo edição.
          Abre o diálogo de confirmação (Req. 9.2) antes de executar (R17). */}
      <button
        type="button"
        onClick={() => setConfirmandoExclusao(true)}
        className="inline-flex items-center gap-2 self-start rounded border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
      >
        Excluir
      </button>

      <ConfirmDeleteDialog
        aberto={confirmandoExclusao}
        titulo="Excluir lavagem"
        mensagem="Tem certeza que deseja excluir esta lavagem? Esta ação não pode ser desfeita."
        onConfirmar={confirmarExclusao}
        onCancelar={() => setConfirmandoExclusao(false)} // Req. 9.4
        confirmando={excluir.isPending} // Req. 9.5 (desabilita durante a exclusão)
      />
    </>
  );
}
