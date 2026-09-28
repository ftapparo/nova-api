import { Pool } from 'pg';

// Pool compartilhado da API com o Postgres (nova-postgres). Usa a role
// nova_api_app, dona só do schema public — nunca a role superusuário
// nova_app, que é só para uso administrativo manual.
export const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.NOVA_API_APP_USER,
    password: process.env.NOVA_API_APP_PASSWORD,
    max: Number(process.env.POSTGRES_POOL_SIZE || 10),
});
