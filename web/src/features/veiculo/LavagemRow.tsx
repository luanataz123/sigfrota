// features/veiculo/LavagemRow.tsx
//
// Linha da lista de lavagens do painel do veículo (R20 / Req. 2.3, 2.4; R21 /
// Req. 3.3). Renderiza uma `<tr>` com as colunas:
//  - Tipo de Lavagem: descrição do tipo (DS_TIPO_LAVAGEM) resolvida pelo
//    `idTipoLavagem` via o mapa de tipos recebido do painel (R20).
//  - Data: ISO `YYYY-MM-DD` → `DD/MM/AAAA` (lib/format.isoParaBr — Req. 2.3).
//  - Local: própria unidade (R09/R10) ou posto — conveniado (nome, R13) ou não
//    conveniado (descrição, R14). O CNPJ NÃO é exibido (minimização / LGPD).
//  - Odômetro (Km): inteiro com separador de milhar (formatarKm — Req. 2.3).
//  - Valor: BRL; lavagem interna (sem valor) exibe "—" (formatarValorLavagem —
//    R10 / Req. 2.4).
// e uma coluna de ação com o LINK de edição para
// `/veiculos/:idVeiculo/lavagens/:idLavagem` (R21 / Req. 3.3), operável por
// teclado (é um `<Link>` âncora nativo).

import { Link } from 'react-router-dom';
import type { Lavagem } from '../../api/types';
import { formatarKm, formatarValorLavagem, isoParaBr } from '../../lib/format';

export interface LavagemRowProps {
  /** A lavagem a exibir. */
  lavagem: Lavagem;
  /** Mapa `idTipoLavagem → descrição` para a coluna "Tipo de Lavagem". */
  tipos: Map<number, string>;
  /** Mapa `idPosto → nome` dos postos conveniados (coluna "Local"). */
  postos?: Map<number, string>;
}

/** Fallback da coluna de tipo quando a descrição ainda não foi carregada. */
const TIPO_PENDENTE = '—';

/** Cor do selo por tipo de lavagem (apenas apresentação). */
function classeTipo(idTipo: number): string {
  switch (idTipo) {
    case 1:
      return 'bg-sky-50 text-sky-800 ring-sky-200';
    case 2:
      return 'bg-indigo-50 text-indigo-800 ring-indigo-200';
    case 3:
      return 'bg-violet-50 text-violet-800 ring-violet-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

/** Texto e estilo do "Local" conforme o ramo da regra (R09–R14). */
function descreverLocal(lavagem: Lavagem, postos?: Map<number, string>) {
  if (lavagem.propriaUnidade === 'S') {
    return { rotulo: 'Própria unidade', classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200', detalhe: undefined };
  }
  if (lavagem.postoConveniado === 'N') {
    return {
      rotulo: 'Posto não conveniado',
      classe: 'bg-amber-50 text-amber-900 ring-amber-200',
      detalhe: lavagem.dsPosto,
    };
  }
  return {
    rotulo: 'Posto conveniado',
    classe: 'bg-blue-50 text-blue-800 ring-blue-200',
    detalhe: lavagem.idPosto !== undefined ? postos?.get(lavagem.idPosto) : undefined,
  };
}

/**
 * Uma linha (`<tr>`) do histórico de lavagens. Deve ser renderizada dentro de
 * um `<tbody>` de uma tabela com os cabeçalhos correspondentes (ver
 * `PainelLavagens`).
 */
export function LavagemRow({ lavagem, tipos, postos }: LavagemRowProps) {
  const descricaoTipo = tipos.get(lavagem.idTipoLavagem) ?? TIPO_PENDENTE;
  const dataBr = isoParaBr(lavagem.dtLavagem);
  const km = formatarKm(lavagem.kmLavagem);
  const valor = formatarValorLavagem(lavagem.vlLavagem);
  const local = descreverLocal(lavagem, postos);

  return (
    <tr className="border-b border-slate-100 transition last:border-b-0 hover:bg-blue-50/40">
      <td className="px-4 py-3 text-sm">
        <span className={`badge ${classeTipo(lavagem.idTipoLavagem)}`}>{descricaoTipo}</span>
      </td>
      <td className="px-4 py-3 text-sm font-medium tabular-nums text-slate-800">{dataBr}</td>
      <td className="px-4 py-3 text-sm">
        <span className="flex flex-col items-start gap-0.5">
          <span className={`badge ${local.classe}`}>{local.rotulo}</span>
          {local.detalhe && (
            <span className="max-w-[16rem] truncate text-xs text-slate-500">{local.detalhe}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-800">
        {km}
      </td>
      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
        {valor}
      </td>
      <td className="px-4 py-3 text-right text-sm">
        <Link
          to={`/veiculos/${lavagem.idVeiculo}/lavagens/${lavagem.idLavagem}`}
          className="rounded-md px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50 hover:underline"
          aria-label={`Editar lavagem de ${dataBr || 'data não informada'}`}
        >
          Editar
        </Link>
      </td>
    </tr>
  );
}
