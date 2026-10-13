import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { successResponseSchema } from '../shared/response';
import { requireAuth } from '../shared/require-auth';
import { currentTermsVersion, getTermsStatus, recordTermsAcceptance, type TermsStatus } from './legal.acceptance';
import { accountDeletionPage, findDocumentVersion, listCurrentDocuments, publicUrl, type LegalDocument } from './legal.documents';
import { acceptTermsBodySchema, documentVersionParamsSchema, legalDocumentSchema, termsStatusSchema } from './legal.schema';

// =============================================================================
// Termo de Uso e Política de Privacidade. Páginas e PDFs são públicos, sem
// token: a Google Play e a App Store exigem a Política acessível antes de
// qualquer login. Ficam fora de /v3/api para os links publicados nas lojas
// não dependerem da versão da API.
// =============================================================================

// Sem JavaScript nem recurso externo: a CSP bloqueia tudo além do CSS inline.
const PAGE_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    // O endereço sem versão muda de conteúdo quando sai versão nova, e o app registra o aceite da versão
    // vigente: uma cópia guardada mostraria o texto anterior para ser aceito. no-cache obriga a
    // conferir com o servidor a cada abertura.
    'Cache-Control': 'no-cache',
};

// /<documento>/<versão>/pdf nunca muda de conteúdo.
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const sendPdf = (reply: FastifyReply, doc: LegalDocument, cacheControl = PAGE_HEADERS['Cache-Control']) =>
    reply
        .headers(PAGE_HEADERS)
        .header('Cache-Control', cacheControl)
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${doc.document}-${doc.version}.pdf"`)
        .send(doc.pdf);

/** Rotas na raiz (sem prefixo): /termos-de-uso, /politica-de-privacidade e os PDFs. */
export async function legalPageRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    // Link colado com barra final ("/termos-de-uso/") daria 404. Redireciona
    // para o endereço sem barra, o único publicado nas lojas. Location
    // relativa: vale para novaresidence.com.br e www.
    const registerPage = (publicPath: string, html: string) => {
        app.get(publicPath, async (_request, reply) =>
            reply.headers(PAGE_HEADERS).type('text/html; charset=utf-8').send(html));
        app.get(`${publicPath}/`, async (_request, reply) => reply.redirect(publicPath, 301));
    };

    // Exigida pela Google Play: como excluir a conta sem depender do app.
    registerPage('/excluir-conta', accountDeletionPage);

    for (const doc of listCurrentDocuments()) {
        registerPage(doc.publicPath, doc.html);

        app.get(`${doc.publicPath}/pdf`, async (_request, reply) => sendPdf(reply, doc));

        // Versões anteriores continuam consultáveis: aceites antigos apontam para elas.
        typedApp.get(`${doc.publicPath}/:version/pdf`, {
            schema: { params: documentVersionParamsSchema },
        }, async (request, reply) => {
            const version = findDocumentVersion(doc.document, request.params.version);
            if (!version) return reply.fail({ type: 'not-found', detail: 'Versão do documento não encontrada.', instance: request.url });
            return sendPdf(reply, version, IMMUTABLE_CACHE);
        });
    }
}

const toStatusResponse = (status: TermsStatus) => ({
    ...status,
    acceptedAt: status.acceptedAt?.toISOString() ?? null,
});

/** Rotas sob /v3/api, no escopo público: catálogo sem token, aceite com requireAuth. */
export async function legalRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get('/legal', {
        schema: { response: { 200: successResponseSchema(z.array(legalDocumentSchema)) } },
    }, async (_request, reply) => reply.ok(listCurrentDocuments().map((doc) => ({
        document: doc.document,
        title: doc.title,
        version: doc.version,
        effectiveDate: doc.effectiveDate,
        sha256: doc.sha256,
        htmlUrl: publicUrl(doc),
        pdfUrl: publicUrl(doc, '/pdf'),
    }))));

    typedApp.get('/legal/acceptance', {
        onRequest: requireAuth,
        schema: { response: { 200: successResponseSchema(termsStatusSchema) } },
    }, async (request, reply) => reply.ok(toStatusResponse(await getTermsStatus(request.actor!.id))));

    // Aceite pelo app (conta antiga ou versão nova do Termo). Idempotente.
    typedApp.post('/legal/terms/accept', {
        onRequest: requireAuth,
        schema: { body: acceptTermsBodySchema, response: { 200: successResponseSchema(termsStatusSchema) } },
    }, async (request, reply) => {
        // O app mostrou uma versão que já não é a vigente: não grava aceite
        // de um texto que o usuário não leu.
        if (request.body.version !== currentTermsVersion()) {
            return reply.fail({ type: 'conflict', detail: 'O Termo de Uso foi atualizado. Leia a versão vigente.', instance: request.url });
        }
        await recordTermsAcceptance(request, request.actor!.id, 'app');
        return reply.ok(toStatusResponse(await getTermsStatus(request.actor!.id)));
    });
}
