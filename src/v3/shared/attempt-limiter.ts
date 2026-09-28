// =============================================================================
// Contador de tentativas por chave (IP, e-mail, conta) em janela fixa.
// Usado pelo login/signup (auth/) e pelos comandos de exaustor (exhaust/).
//
// Em memória, por processo: basta com uma réplica só da API. Com várias
// réplicas, migrar para Redis (CHECKLIST §2.6).
// =============================================================================

type Window = { count: number; resetAt: number };

export class AttemptLimiter {
    private readonly windows = new Map<string, Window>();

    constructor(private readonly max: number, private readonly windowMs: number) {
        // Limpeza periódica para o Map não crescer indefinidamente com
        // chaves de IPs/e-mails que nunca mais voltam. unref(): não segura
        // o processo vivo só por causa deste timer.
        setInterval(() => this.sweep(), windowMs).unref();
    }

    /** Segundos até liberar, ou 0 se a chave ainda está dentro do limite. */
    retryAfter(key: string): number {
        const window = this.windows.get(key);
        if (!window || window.resetAt <= Date.now()) return 0;
        return window.count >= this.max ? Math.ceil((window.resetAt - Date.now()) / 1000) : 0;
    }

    hit(key: string): void {
        const now = Date.now();
        const window = this.windows.get(key);
        if (!window || window.resetAt <= now) {
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
            return;
        }
        window.count += 1;
    }

    reset(key: string): void {
        this.windows.delete(key);
    }

    private sweep(): void {
        const now = Date.now();
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
    }
}
