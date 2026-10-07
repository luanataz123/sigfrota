// components/DiagramaArquitetura.tsx
//
// Botão "Arquitetura" da barra superior e o modal com o diagrama da solução
// na AWS (para a banca e para quem chega ao projeto). O diagrama é um SVG
// estático em `web/public/` (cópia de `docs/arquitetura-aws.svg`), sem
// scripts nem estilos embutidos, então respeita a CSP do CloudFront.
//
// Acessibilidade: `<dialog>` nativo com `showModal()` (foco preso no modal,
// Esc fecha, fundo inerte), título associado por `aria-labelledby` e imagem
// com texto alternativo. Clicar no fundo escurecido também fecha.

import { useEffect, useRef, useState } from 'react';

const SVG = '/arquitetura-aws.svg';
const PNG = '/arquitetura-aws.png';

/** Ícone de "camadas" (diagrama) usado no botão. */
function IconeDiagrama() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17.5l9 5 9-5" opacity="0.5" />
    </svg>
  );
}

/** Pílulas com os serviços em destaque, abaixo do título do modal. */
const SERVICOS = ['CloudFront + S3', 'Cognito', 'API Gateway', 'Lambda (Node.js)', 'DynamoDB', 'Bedrock', 'CDK + cdk-nag'];

export function BotaoArquitetura() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [ampliado, setAmpliado] = useState(false);

  function abrir() {
    setAmpliado(false);
    document.body.classList.add('overflow-hidden');
    dialogo.current?.showModal();
  }

  function fechar() {
    dialogo.current?.close();
  }

  // Trava a rolagem da página enquanto o modal está aberto.
  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const aoFechar = () => document.body.classList.remove('overflow-hidden');
    el.addEventListener('close', aoFechar);
    return () => el.removeEventListener('close', aoFechar);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:ring-offset-blue-900"
        aria-haspopup="dialog"
      >
        <IconeDiagrama />
        Arquitetura
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-arquitetura"
        onClick={(e) => {
          // Clique fora do conteúdo (no backdrop) fecha o modal.
          if (e.target === e.currentTarget) fechar();
        }}
        className="m-auto h-[92vh] w-[96vw] max-w-7xl overflow-hidden rounded-2xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 px-6 py-4 text-white">
            <div className="flex flex-col gap-2">
              <h2 id="titulo-arquitetura" className="text-lg font-bold tracking-tight">
                Arquitetura serverless na AWS
              </h2>
              <p className="text-sm text-blue-100/90">
                Migração APEX → serverless assistida por IA, com rastreabilidade das regras R01–R23.
              </p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Serviços AWS da solução">
                {SERVICOS.map((s) => (
                  <li key={s} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/25">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmpliado((v) => !v)}
                aria-pressed={ampliado}
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/20"
              >
                {ampliado ? 'Ajustar à tela' : 'Ampliar'}
              </button>
              <a
                href={SVG}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/20"
              >
                Abrir em nova aba
              </a>
              <a
                href={PNG}
                download="sigfrota-arquitetura-aws.png"
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/20"
              >
                Baixar PNG
              </a>
              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar diagrama de arquitetura"
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xl leading-none transition hover:bg-white/25"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </header>

          <div className={`flex-1 bg-slate-50 p-4 ${ampliado ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}>
            <img
              src={SVG}
              alt="Diagrama da arquitetura AWS do SIG Frota: usuário acessa o front pelo CloudFront e S3, faz login no Cognito e chama o API Gateway com JWT; as Lambdas em Node.js aplicam as regras do packages/dominio e gravam no DynamoDB. As features de IA usam S3, EventBridge, Step Functions e Bedrock. IAM, KMS, CloudWatch, SSM e CDK dão segurança, observabilidade e infraestrutura como código."
              onClick={() => setAmpliado((v) => !v)}
              className={`rounded-xl bg-white shadow-sm ring-1 ring-slate-200 ${
                ampliado ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'
              }`}
              width={1500}
              height={1010}
            />
          </div>
        </div>
      </dialog>
    </>
  );
}
