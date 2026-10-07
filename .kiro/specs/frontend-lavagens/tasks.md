# Plano de Implementação — Frontend do Módulo de Lavagem

Tarefas incrementais e orientadas a código. Cada item cita os requisitos
(`requirements.md`) e, quando aplicável, as regras Rxx. A ordem permite rodar e
ver resultado cedo com o `MockLavagemClient`, integrando a API real só no fim.

- [x] 1. Scaffold do projeto `web/` (Vite + React + TS + Tailwind)
  - Criar app Vite React-TS em `web/`, configurar Tailwind (config, diretivas CSS)
    e scripts (`dev`, `build`, `test`).
  - Registrar `web/` como workspace npm no monorepo (raiz) para consumir
    `packages/dominio`.
  - _Requisitos: 10.5, 11.1_

- [x] 2. Tipos do contrato e camada de client
- [x] 2.1 Definir tipos do contrato em `src/api/types.ts`
  - `Veiculo`, `TipoLavagem`, `Posto`, `Lavagem`, `SimNao` conforme o design.
  - _Requisitos: 11.4_ · _Regras: R02–R16_
- [x] 2.2 Definir a interface `LavagemClient`
  - Métodos de listar/obter/criar/atualizar/excluir e listas auxiliares.
  - _Requisitos: 11.1_ · _Regras: R17, R19–R22_
- [x] 2.3 Implementar `MockLavagemClient` + dados sintéticos
  - `src/mocks/dados-sinteticos.ts` com veículo 101 (com `kmAtual`), tipos,
    postos e ao menos uma lavagem; simular latência e erros.
  - _Requisitos: 11.3, 2.6, 2.7_ · _Regras: R19, R23_
- [x] 2.4 Implementar `clientFactory` (real/mock por `VITE_USE_MOCK`)
  - `HttpLavagemClient` como esqueleto (injeção de JWT, tratamento 401) a ser
    completado na tarefa de integração.
  - _Requisitos: 11.2, 1.3, 1.4_

- [x] 3. Autenticação e providers base
- [x] 3.1 `AuthProvider` + `useAuth` + `RequireAuth`
  - Contexto de sessão (token, usuário), guard de rota, logout.
  - _Requisitos: 1.1, 1.2, 1.3, 1.5, 1.6_
- [x] 3.2 `LoginPage` e tratamento de 401 global
  - Form de login (mockável) e encerramento de sessão em expiração/401.
  - _Requisitos: 1.1, 1.2, 1.4_
- [x] 3.3 `providers.tsx` + `router.tsx`
  - QueryClient (TanStack), Toaster e rotas protegidas conforme a tabela do design.
  - _Requisitos: 1.1_

- [x] 4. Componentes base acessíveis e formatação
- [x] 4.1 Inputs reutilizáveis (`Field`, `Select`, `DateInput`, `MoneyInput`)
  - `label` associado, `aria-invalid`, mensagem de erro vinculada; navegação por
    teclado.
  - _Requisitos: 10.2, 10.3_
- [x] 4.2 Estados de UI (`Spinner`, `EmptyState`, `ErrorState`, `Toast`)
  - _Requisitos: 2.5, 2.6, 2.7, 10.1_
- [x] 4.3 Utilitários `lib/format.ts`
  - Data `DD/MM/AAAA` ⇄ ISO, moeda BRL, km com separador; "—" para interna.
  - _Requisitos: 2.3, 2.4, 7.2_

- [x] 5. Painel de lavagens do veículo (listagem)
- [x] 5.1 `useLavagens` (query) + `obterVeiculo` (Km Atual)
  - Busca `GET /veiculos/{id}/lavagens`, ordenação por data no cliente se preciso.
  - _Requisitos: 2.1, 2.2, 2.8_ · _Regras: R16, R19_
- [x] 5.2 `PainelLavagens` + `LavagemRow`
  - Colunas tipo/data/km/valor, Km Atual read-only, link de edição por linha,
    botão "Incluir Lavagem", estados vazio/loading/erro.
  - _Requisitos: 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.3_ · _Regras: R20, R21, R22_
- [x] 5.3 `VeiculoPage` + exibição de toast de sucesso ao voltar
  - _Requisitos: 3.1, 8.4_ · _Regras: R18, R23_

- [x] 6. Ponte de validação com o domínio
- [x] 6.1 `lib/validationResolver.ts` ligado a `@sigfrota/dominio`
  - Adaptar `validarLavagem` (R02–R04, R09–R15) ao resolver do React Hook Form.
  - Se o domínio não existir ainda, criar stub com a mesma assinatura.
  - _Requisitos: 4.6_ · _Regras: R02–R04, R09–R15_
- [x] 6.2 `camposCondicionais.ts` (visibilidade derivada do estado)
  - `visibilidade()` para valor/posto conforme unidade e conveniado.
  - _Requisitos: 5.2, 5.3, 6.2, 6.4_ · _Regras: R09–R14_
- [x] 6.3 Testes unitários de `camposCondicionais` e do resolver
  - Cobrir alternâncias e cada ramo de obrigatoriedade.
  - _Requisitos: 5.2–5.5, 6.2–6.7_ · _Regras: R09–R15_

- [x] 7. Formulário de lavagem
- [x] 7.1 `LavagemForm` com React Hook Form + resolver
  - Todos os campos; obrigatórios base (tipo, data, km); popular tipos e postos.
  - _Requisitos: 4.1, 4.2, 4.5, 6.6_ · _Regras: R02, R05_
- [x] 7.2 Comportamento condicional unidade × externa
  - Toggle "Na própria unidade?" (default Sim); mostrar/ocultar e limpar campos;
    valor obrigatório na externa.
  - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_ · _Regras: R09, R10, R11_
- [x] 7.3 Comportamento conveniado × não conveniado
  - Toggle "Posto conveniado?" (default Sim); seleção de posto OU descrição+CNPJ;
    limpar ramo oculto.
  - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_ · _Regras: R12, R13, R14_
- [x] 7.4 Validações de valor, km e data no envio
  - Bloqueio e sinalização por campo (km>0, valor>0, data válida).
  - _Requisitos: 4.3, 4.4, 7.1, 7.2_ · _Regras: R03, R04, R15_
- [x] 7.5 Montagem do payload por ramo (não enviar campos ocultos)
  - _Requisitos: 8.3_ · _Regras: R10, R13, R14_

- [x] 8. Mutações: incluir, alterar, excluir
- [x] 8.1 `useLavagemMutations` (create/update/delete) + invalidação de query
  - Invalida `['lavagens', idVeiculo]` no sucesso (resultado na tela).
  - _Requisitos: 8.1, 8.2, 8.5_ · _Regras: R17, R23_
- [x] 8.2 `LavagemFormPage` modos inclusão/edição + navegação pós-salvar
  - Carregar por `idLavagem` na edição; voltar ao painel com sucesso.
  - _Requisitos: 3.2, 3.3, 3.4, 8.4_ · _Regras: R18, R21, R22_
- [x] 8.3 Estados de salvamento (desabilitar botão, erro mantém dados)
  - _Requisitos: 8.6, 8.7_
- [x] 8.4 `ConfirmDeleteDialog` + exclusão
  - Confirmação, sucesso remove da lista e volta com mensagem, cancelar não exclui.
  - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5_ · _Regras: R17, R18_

- [x] 9. Testes de componente espelhando o gabarito
  - Casos felizes (interna, conveniado, não conveniado) e de erro (km zero, valor
    zero/ausente externo, conveniado sem posto, não conveniado sem CNPJ, data
    inválida), listagem por veículo e resultado na tela.
  - Nome de cada teste cita a Rxx (rastreabilidade).
  - _Requisitos: 2.1–2.3, 5, 6, 7, 8.5, 9_ · _Regras: R03, R04, R09–R15, R19, R23_

- [x] 10. Acessibilidade, responsividade e segurança no cliente
  - Revisar labels/aria, foco em diálogos, navegação por teclado; layout
    responsivo desktop/tablet; garantir que CNPJ e dados sensíveis não vão para
    o console.
  - _Requisitos: 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 11. Integração com a API real
  - Completar `HttpLavagemClient` (JWT, 401 → logout) e validar o fluxo ponta a
    ponta contra o contrato de `api-lavagens`; alternar `VITE_USE_MOCK=false`.
  - _Requisitos: 1.3, 1.4, 11.1, 11.2_ · _Regras: R17, R19_

- [x] 12. Build e verificação final
  - Garantir `npm run build` e `npm run test` verdes; checar demo do veículo 101
    (incluir lavagem → aparece no painel) com mock e com API.
  - _Requisitos: 8.5, 11.3_ · _Regras: R19, R23_
