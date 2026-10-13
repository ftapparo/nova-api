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
    'Cache-Control': 'public, max-age=3600',
};

const sendPdf = (reply: FastifyReply, doc: LegalDocument) =>
    reply
        .headers(PAGE_HEADERS)
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${doc.document}-${doc.version}.pdf"`)
        .send(doc.pdf);

/** Rotas na raiz (sem prefixo): /termos-de-uso, /politica-de-privacidade e os PDFs. */
export async function legalPageRoutes(app: FastifyInstance) {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    // Exigida pela Google Play: como excluir a conta sem depender do app.
    app.get('/excluir-conta', async (_request, reply) =>
        reply.headers(PAGE_HEADERS).type('text/html; charset=utf-8').send(accountDeletionPage));

    for (const doc of listCurrentDocuments()) {
        app.get(doc.publicPath, async (_request, reply) =>
            reply.headers(PAGE_HEADERS).type('text/html; charset=utf-8').send(doc.html));

        app.get(`${doc.publicPath}/pdf`, async (_request, reply) => sendPdf(reply, doc));

        // Versões anteriores continuam consultáveis: aceites antigos apontam para elas.
        typedApp.get(`${doc.publicPath}/:version/pdf`, {
            schema: { params: documentVersionParamsSchema },
        }, async (request, reply) => {
            const version = findDocumentVersion(doc.document, request.params.version);
            if (!version) return reply.fail({ type: 'not-found', detail: 'Versão do documento não encontrada.', instance: request.url });
            return sendPdf(reply, version);
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
