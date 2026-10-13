import { z } from 'zod';

export const legalDocumentSchema = z.object({
    document: z.enum(['termo-de-uso', 'politica-de-privacidade']),
    title: z.string(),
    version: z.string(),
    /** Data de vigência (AAAA-MM-DD). */
    effectiveDate: z.string(),
    /** SHA-256 do PDF oficial. */
    sha256: z.string(),
    htmlUrl: z.string(),
    pdfUrl: z.string(),
});

export const termsStatusSchema = z.object({
    termsVersion: z.string(),
    acceptedVersion: z.string().nullable(),
    acceptedAt: z.iso.datetime().nullable(),
    mustAcceptTerms: z.boolean(),
});

export const acceptTermsBodySchema = z.object({
    /** Versão que o app mostrou ao usuário; precisa ser a vigente. */
    version: z.string().min(1).max(20),
});

export const documentVersionParamsSchema = z.object({ version: z.string().min(1).max(20) });
