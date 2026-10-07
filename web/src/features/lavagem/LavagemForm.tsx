// features/lavagem/LavagemForm.tsx
//
// Formulário de lavagem (Req. 4/5/6/7). ESTRUTURA BASE (tarefa 7.1):
//  - React Hook Form (`useForm`) com o `lavagemResolver`, que delega TODA a
//    validação ao domínio `@sigfrota/dominio` (fonte única — Req. 4.6). O
//    componente NÃO reimplementa regra alguma: apenas liga campos e exibe erros.
//  - TODOS os campos do Req. 4.1 renderizados (tipo, data, km, "na própria
//    unidade?", "posto conveniado?", valor, seleção de posto, descrição, CNPJ).
//  - Obrigatórios base tipo/data/km (R02) exigidos pelo resolver; o envio só
//    chama `onSubmit` quando o resolver aprova (`handleSubmit`).
//  - Selects de tipo (Req. 4.5 / R05 — envia `idTipoLavagem`) e posto
//    (Req. 6.6 / R13 — envia `idPosto`) populados via `useTipos`/`usePostos`.
//
// Pontos de extensão para as tarefas seguintes (já preparados aqui):
//  - 7.2 (unidade × externa) e 7.3 (conveniado × não conveniado): a visibilidade
//    condicional já é derivada por `visibilidade(estado)` de `camposCondicionais`
//    a partir de `watch`; a LIMPEZA fina de ramos ocultos (reset/clearErrors) e a
//    exigência de valor na externa serão refinadas nessas tarefas.
//  - 7.4: as validações de valor/km/data já vêm do resolver; o refino de
//    sinalização por campo entra lá.
//  - 7.5: a montagem do payload por ramo (omitir campos ocultos) entra aqui — o
//    `onSubmit` recebe o payload FINAL já saneado por ramo (`montarPayloadLavagem`),
//    com `idVeiculo` incluído (R02) e os campos ocultos OMITIDOS (R10/R13/R14).
//
// Mutações (POST/PUT) NÃO vivem aqui: a tarefa 8 liga `onSubmit` às mutações e
// à navegação. Este componente é controlado por RHF e apenas expõe `onSubmit`.

import { useEffect } from 'react';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import type { Lavagem, SimNao } from '../../api/types';
import {
  lavagemResolver,
  type ValoresFormularioLavagem,
} from '../../lib/validationResolver';
import { useTipos } from '../veiculo/useTipos';
import { usePostos } from './usePostos';
import { camposOcultos, visibilidade } from './camposCondicionais';
import { montarPayloadLavagem } from './montarPayload';
import { Field } from '../../components/Field';
import { Select, type SelectOption } from '../../components/Select';
import { DateInput } from '../../components/DateInput';
import { MoneyInput } from '../../components/MoneyInput';
import { Spinner } from '../../components/Spinner';

export interface LavagemFormProps {
  /** Veículo ao qual a lavagem pertence (contexto; não é campo editável). */
  idVeiculo: number;
  /**
   * Valores iniciais (modo edição — tarefa 8.2). Em inclusão, omitir: o form
   * usa os defaults (interna/conveniado por R09/R12).
   */
  valoresIniciais?: Partial<ValoresFormularioLavagem>;
  /**
   * Chamado com o PAYLOAD FINAL já saneado por ramo quando o envio é aprovado
   * pelo resolver. O payload inclui `idVeiculo` (contexto, R02) e OMITE os
   * campos ocultos do estado atual (R10/R13/R14) — pronto para a API (tarefa 8).
   */
  onSubmit: (payload: Lavagem) => void;
  /**
   * Indica que um salvamento está em andamento (tarefa 8.3 / Req. 8.6). Quando
   * `true`, o botão "Salvar" fica desabilitado e exibe o progresso ("Salvando…"
   * + spinner), evitando envio duplicado. O estado é gerenciado por quem detém a
   * mutação (`LavagemFormPage`), que passa `criar.isPending`/`atualizar.isPending`.
   * Default `false` para não afetar quem usa o formulário sem mutação.
   */
  enviando?: boolean;
}

/** Opções Sim/Não para os toggles "Na própria unidade?" / "Posto conveniado?". */
const OPCOES_SIM_NAO: SelectOption[] = [
  { value: 'S', label: 'Sim' },
  { value: 'N', label: 'Não' },
];

/**
 * Monta os `defaultValues` do RHF a partir dos valores iniciais, aplicando os
 * defaults de domínio: interna (R09) e conveniado (R12) por padrão.
 */
function montarDefaults(
  iniciais?: Partial<ValoresFormularioLavagem>,
): Partial<ValoresFormularioLavagem> {
  return {
    propriaUnidade: 'S', // R09 (default interna)
    postoConveniado: 'S', // R12 (default conveniado quando externa)
    ...iniciais,
  };
}

export function LavagemForm({
  idVeiculo,
  valoresIniciais,
  onSubmit,
  enviando = false,
}: LavagemFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<ValoresFormularioLavagem>({
    resolver: lavagemResolver,
    defaultValues: montarDefaults(valoresIniciais),
  });

  // Tipos (Req. 4.5 / R05) e postos (Req. 6.6 / R13) do contrato.
  const { data: tipos } = useTipos();
  const { data: postos } = usePostos();

  const opcoesTipo: SelectOption[] = (tipos ?? []).map((t) => ({
    value: t.idTipoLavagem,
    label: t.descricao,
  }));
  const opcoesPosto: SelectOption[] = (postos ?? []).map((p) => ({
    value: p.idPosto,
    label: p.nome,
  }));

  // Visibilidade condicional derivada do estado atual (R09–R14). Ponto de
  // extensão das tarefas 7.2/7.3 — aqui apenas liga/desliga os campos.
  const propriaUnidade = (watch('propriaUnidade') ?? 'S') as SimNao;
  // Valor BRUTO de "Posto conveniado?" (pode ser undefined após limpeza numa
  // alternância para interna). O default 'S' só é aplicado para a visibilidade.
  const postoConveniadoRaw = watch('postoConveniado') as SimNao | undefined;
  const postoConveniado = (postoConveniadoRaw ?? 'S') as SimNao;
  const vis = visibilidade({ propriaUnidade, postoConveniado });

  // ── Limpeza de ramos ocultos (Req. 5.5 / R10 — e base para 6.7/8.3) ──────────
  //
  // Reagimos à MUDANÇA de `propriaUnidade`/`postoConveniado` (não ao resultado
  // de visibilidade): a cada alternância, os campos que passaram a ficar OCULTOS
  // têm valor E erro descartados. Assim:
  //  - voltar externa → interna NÃO deixa `vlLavagem`/posto preenchidos nem um
  //    erro "pendurado" bloqueando o envio da interna (Req. 5.5);
  //  - o payload não carrega lixo do ramo oculto (apoia Req. 8.3 na tarefa 7.5).
  //
  // Dependemos apenas dos dois valores de estado (strings) — não de objetos
  // recriados a cada render — para evitar loop de re-renderização.
  useEffect(() => {
    // Ao tornar-se externa, garantir o default 'S' de "Posto conveniado?" (R12)
    // caso ele tenha sido limpo numa alternância anterior para interna.
    if (propriaUnidade === 'N' && postoConveniadoRaw == null) {
      setValue('postoConveniado', 'S');
    }

    // Limpa os campos que estão ocultos no estado atual. `camposOcultos` inclui
    // `postoConveniado` apenas quando interna (escolha de posto oculta), então a
    // escolha de ramo nunca é apagada enquanto externa.
    const ocultos = camposOcultos({ propriaUnidade, postoConveniado });
    for (const campo of ocultos) {
      setValue(campo, undefined);
      clearErrors(campo);
    }
    // Reage somente às duas chaves de estado; `setValue`/`clearErrors` são
    // estáveis no RHF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propriaUnidade, postoConveniadoRaw]);

  const aoEnviar: SubmitHandler<ValoresFormularioLavagem> = (valores) => {
    // Monta o payload por ramo: inclui idVeiculo (R02) e omite os campos
    // ocultos do estado atual (R10/R13/R14), independentemente de resíduos.
    onSubmit(montarPayloadLavagem(valores, { idVeiculo }));
  };

  return (
    <form
      onSubmit={handleSubmit(aoEnviar)}
      noValidate
      aria-label="Formulário de lavagem"
      data-id-veiculo={idVeiculo}
      className="flex flex-col gap-4"
    >
      {/* idVeiculo é contexto (R02), não campo editável: fica associado ao
          veículo atual e é incluído no payload por `montarPayloadLavagem` no
          envio (tarefa 7.5). Exposto também em data-id-veiculo para rastreio. */}

      {/* Campos base sempre visíveis. Layout responsivo (Req. 10.5): coluna
          única em telas estreitas, duas colunas a partir de `md` (tablet/desktop).
          Os campos condicionais abaixo ficam em largura total para não causar
          saltos de layout quando aparecem/desaparecem. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Tipo de lavagem — obrigatório (R02); envia idTipoLavagem (Req. 4.5/R05). */}
        <Select
          label="Tipo de lavagem"
          placeholder="Selecione o tipo"
          options={opcoesTipo}
          required
          error={errors.idTipoLavagem?.message}
          {...register('idTipoLavagem', { valueAsNumber: true })}
        />

        {/* Data da lavagem — obrigatória (R02); ISO YYYY-MM-DD (R15/Req. 7.2). */}
        <DateInput
          label="Data da lavagem"
          required
          error={errors.dtLavagem?.message}
          {...register('dtLavagem')}
        />

        {/* Odômetro (Km) — obrigatório e > 0 (R02/R04). */}
        <Field
          label="Odômetro (Km)"
          type="number"
          inputMode="numeric"
          min={1}
          required
          error={errors.kmLavagem?.message}
          {...register('kmLavagem', { valueAsNumber: true })}
        />

        {/* "Na própria unidade?" — toggle S/N, default S (R09). */}
        <Select
          label="Na própria unidade?"
          options={OPCOES_SIM_NAO}
          error={errors.propriaUnidade?.message}
          {...register('propriaUnidade')}
        />
      </div>

      {/* "Posto conveniado?" — toggle S/N, default S (R12). Só faz sentido na
          externa; a visibilidade fina é refinada na tarefa 7.3. */}
      {vis.escolhaPostoConveniado && (
        <Select
          label="Posto conveniado?"
          options={OPCOES_SIM_NAO}
          error={errors.postoConveniado?.message}
          {...register('postoConveniado')}
        />
      )}

      {/* Valor (MoneyInput) — numérico; obrigatório na externa (R03/R11). Usa
          Controller por emitir number via onValueChange. */}
      {vis.valor && (
        <Controller
          control={control}
          name="vlLavagem"
          render={({ field }) => (
            <MoneyInput
              label="Valor"
              required
              value={field.value ?? undefined}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.vlLavagem?.message}
            />
          )}
        />
      )}

      {/* Seleção de posto conveniado — envia idPosto (Req. 6.6/R13). */}
      {vis.selecaoPosto && (
        <Select
          label="Posto conveniado (seleção)"
          placeholder="Selecione o posto"
          options={opcoesPosto}
          required
          error={errors.idPosto?.message}
          {...register('idPosto', { valueAsNumber: true })}
        />
      )}

      {/* Descrição do posto — obrigatória no não conveniado (R14). */}
      {vis.dsPosto && (
        <Field
          label="Descrição do posto"
          required
          error={errors.dsPosto?.message}
          {...register('dsPosto')}
        />
      )}

      {/* CNPJ do posto — obrigatório no não conveniado (R14). */}
      {vis.cnpjPosto && (
        <Field
          label="CNPJ do posto"
          required
          error={errors.cnpjPosto?.message}
          {...register('cnpjPosto')}
        />
      )}

      {/* Botão Salvar — durante o envio (Req. 8.6) fica desabilitado e indica o
          progresso ("Salvando…" + spinner), evitando envio duplicado. */}
      <button
        type="submit"
        disabled={enviando}
        aria-busy={enviando}
        className="inline-flex items-center gap-2 self-start rounded bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-800"
      >
        {enviando && (
          <Spinner
            label="Salvando…"
            tamanho="pequeno"
            className="inline-flex items-center text-white"
          />
        )}
        {enviando ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
