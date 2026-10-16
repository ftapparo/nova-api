import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

// =============================================================================
// Termo de Uso e Política de Privacidade. O PDF é o documento oficial: o
// SHA-256 dele vai para cada aceite. O HTML gerado do .md é só a versão de
// leitura no celular, com link para o PDF. Os arquivos ficam em legal/ na
// raiz do projeto (fora de src/: o tsc não copia .md/.pdf para dist/).
//
// Versão nova: adicionar <versão>.pdf e <versão>.md em legal/<documento>/,
// mover `current` para ela aqui e nunca apagar a anterior — aceites antigos
// apontam para o hash dela.
// =============================================================================

export type LegalDocumentId = 'termo-de-uso' | 'politica-de-privacidade';

type CatalogEntry = {
    document: LegalDocumentId;
    title: string;
    /** Caminho público, sem prefixo de versão da API (links nas lojas não podem mudar). */
    publicPath: string;
    version: string;
    effectiveDate: string;
    current: boolean;
};

const CATALOG: CatalogEntry[] = [
    { document: 'termo-de-uso', title: 'Termo de Uso', publicPath: '/termos-de-uso', version: '1.0', effectiveDate: '2026-10-13', current: false },
    { document: 'politica-de-privacidade', title: 'Política de Privacidade', publicPath: '/politica-de-privacidade', version: '1.0', effectiveDate: '2026-10-13', current: false },
    // 1.1: validação de localização para comandos (CIE e exaustor) e permissões de notificação.
    { document: 'termo-de-uso', title: 'Termo de Uso', publicPath: '/termos-de-uso', version: '1.1', effectiveDate: '2026-10-13', current: true },
    { document: 'politica-de-privacidade', title: 'Política de Privacidade', publicPath: '/politica-de-privacidade', version: '1.1', effectiveDate: '2026-10-13', current: false },
    // Política 1.2: dados do push nativo (token, instalação, modelo e versões), conteúdo dos avisos e retenção.
    { document: 'politica-de-privacidade', title: 'Política de Privacidade', publicPath: '/politica-de-privacidade', version: '1.2', effectiveDate: '2026-10-14', current: false },
    // Política 1.3: vinculação automática por CPF e celular (sem armazenar) e registro de atividades por 12 meses.
    { document: 'politica-de-privacidade', title: 'Política de Privacidade', publicPath: '/politica-de-privacidade', version: '1.3', effectiveDate: '2026-10-16', current: true },
];

export type LegalDocument = CatalogEntry & { sha256: string; pdf: Buffer; html: string };

// Mesma profundidade em src/v3/legal (ts-node-dev) e dist/v3/legal (build).
const LEGAL_DIR = path.resolve(__dirname, '../../../legal');

// html: false escapa qualquer HTML bruto do .md — dispensa sanitizador.
const markdown = new MarkdownIt({ html: false, linkify: true });

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Cabeçalho, estilo e moldura comuns às páginas públicas (documentos e exclusão de conta).
const renderShell = (title: string, inner: string): string => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Nova Residence</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2933; --muted: #52606d; --line: #d9e2ec; --accent: #1d4ed8; }
@media (prefers-color-scheme: dark) { :root { --bg: #111827; --fg: #e5e7eb; --muted: #9ca3af; --line: #374151; --accent: #93c5fd; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.official { display: block; margin: 0 0 24px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; color: var(--accent); font-weight: 600; text-decoration: none; text-align: center; }
h1 { font-size: 1.5rem; line-height: 1.3; margin: 0 0 16px; }
h2 { font-size: 1.15rem; margin: 32px 0 8px; padding-top: 16px; border-top: 1px solid var(--line); }
hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
/* O "---" depois do cabeçalho do documento já separa a primeira seção: sem segunda linha. */
hr + h2 { margin-top: 0; padding-top: 0; border-top: 0; }
a { color: var(--accent); overflow-wrap: anywhere; }
p, li { overflow-wrap: break-word; }
footer { margin-top: 40px; color: var(--muted); font-size: 0.875rem; }
</style>
</head>
<body>
<main>
${inner}</main>
</body>
</html>
`;

const renderPage = (entry: CatalogEntry, body: string): string => renderShell(entry.title, `<a class="official" href="${entry.publicPath}/pdf">Baixar documento oficial (PDF) — versão ${escapeHtml(entry.version)}</a>
${body}
<footer>Versão ${escapeHtml(entry.version)} · vigente desde ${escapeHtml(entry.effectiveDate.split('-').reverse().join('/'))} · <a href="${entry.publicPath}/pdf">documento oficial em PDF</a></footer>
`);

const load = (entry: CatalogEntry): LegalDocument => {
    const base = path.join(LEGAL_DIR, entry.document, entry.version);
    const pdf = readFileSync(`${base}.pdf`);
    const html = renderPage(entry, markdown.render(readFileSync(`${base}.md`, 'utf8')));
    return { ...entry, pdf, html, sha256: createHash('sha256').update(pdf).digest('hex') };
};

/**
 * Página pública de exclusão de conta (Google Play: URL acessível sem o app). Não é documento
 * versionado nem aceito: só instruções, alinhadas ao DELETE /v3/api/auth/me.
 */
export const accountDeletionPage: string = renderShell(
    'Excluir conta',
    markdown.render(readFileSync(path.join(LEGAL_DIR, 'excluir-conta', 'pagina.md'), 'utf8')),
);

// Carregado no import (subida da API): arquivo do catálogo faltando derruba
// a subida na hora, em vez de aparecer só quando alguém tentar aceitar.
const DOCUMENTS: LegalDocument[] = CATALOG.map(load);

export const listCurrentDocuments = (): LegalDocument[] => DOCUMENTS.filter((doc) => doc.current);

export const findCurrentDocument = (document: LegalDocumentId): LegalDocument =>
    DOCUMENTS.find((doc) => doc.document === document && doc.current)!;

export const findDocumentVersion = (document: LegalDocumentId, version: string): LegalDocument | undefined =>
    DOCUMENTS.find((doc) => doc.document === document && doc.version === version);

// Lida dentro da função: imports resolvem antes de dotenv.config().
export const publicUrl = (doc: LegalDocument, suffix = ''): string =>
    `${(process.env.PUBLIC_SITE_URL?.trim() || 'https://novaresidence.com.br').replace(/\/+$/, '')}${doc.publicPath}${suffix}`;
