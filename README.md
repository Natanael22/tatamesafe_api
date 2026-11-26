# TatameSafe API

Backend do **TatameSafe**, uma API para canal de denúncias anônimas, acompanhamento de casos, gestão de academias e administração operacional.

A API oferece cadastro com perfis de aluno e academia, autenticação JWT local, registro criptografado de denúncias, consulta p��blica por protocolo, painel administrativo, controle de SLA, evidências e notificações push.

- Produção: <https://tatamesafe-api.vercel.app>
- Documentação Swagger: `/api-docs`
- Painel administrativo: `/admin`
- Health check: `/health`

## Funcionalidades

- Cadastro e autenticação de alunos, academias e administradores
- JWT local com duração de uma hora
- Denúncias anônimas com descrição criptografada e evidências opcionais
- Consulta pública de status e histórico por protocolo
- Triagem, urgência, encaminhamento e atribuição de operadores
- Controle de SLA por tipo de urgência
- URLs assinadas para evidências armazenadas no Supabase
- Notificações push com Expo
- Avaliações e certificados de academias
- Painel administrativo estático em HTML
- Documentação OpenAPI 3.0

## Tecnologias

- Node.js e TypeScript
- Express 5
- Supabase Auth, Postgres, RPC e Storage
- Prisma 6 (dependência disponível no projeto)
- Redis 7 e BullMQ
- JWT e bcrypt
- Zod
- Multer
- Helmet e CORS
- Pino
- Swagger UI
- Vitest e Supertest
- Docker Compose

## Arquitetura

```text
src/
├── app.ts                 # Configuração do Express, middlewares e rotas
├── server.ts              # Inicialização, validação de ambiente e listen
├── routes/                # Rotas HTTP por domínio
├── middlewares/           # Autenticação e rate limit
├── services/              # Criptografia, push e notificações
├── jobs/                  # Worker BullMQ de denúncias
├── lib/                   # Supabase, Redis, Storage, ViaCEP e logger
├── types/                 # Tipos e constantes do domínio
└── tests/                 # Testes unitários, de rota e integração

public/admin/              # Painel administrativo estático
migrations/                # Alterações SQL específicas do projeto
supabase/migrations/       # Migrações gerenciadas pelo Supabase
swagger.yaml               # Especificação OpenAPI da API
```

O fluxo principal da API é:

1. `src/server.ts` inicia o servidor e valida as variáveis obrigatórias.
2. `src/app.ts` aplica segurança, CORS, logging, Swagger e registra as rotas.
3. As rotas usam `src/lib/supabase.ts` para acessar os schemas `tatame` e `tatame_vault`.
4. Denúncias públicas são armazenadas no vault criptografado e enviadas à fila Redis/BullMQ.
5. O worker processa eventos assíncronos e a API administrativa consulta casos, histórico e evidências.

### Separação de dados

O backend usa dois schemas no Supabase:

- `tatame`: usuários, academias, avaliações e outros dados operacionais.
- `tatame_vault`: dados sensíveis de denúncias e informações relacionadas.

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Projeto no Supabase com os schemas e migrações aplicados
- Redis local ou externo

## Instalação

```bash
git clone https://github.com/Natanael22/tatamesafe_api.git
cd tatamesafe_api
npm install
```

Crie um arquivo `.env` na raiz:

```dotenv
# Obrigatórias
JWT_SECRET=uma-chave-secreta-forte
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Opcionais
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
REDIS_URL=redis://localhost:6379
```

`JWT_SECRET`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são validadas na inicialização e impedem o servidor de iniciar quando estão ausentes.

> Proteja a `SUPABASE_SERVICE_ROLE_KEY` e o `JWT_SECRET`. Nunca versionar ou expor esses valores em código cliente.

### Redis com Docker

```bash
docker compose up -d
```

O Compose inicia Redis 7 em `localhost:6379`, com persistência em volume Docker.

## Execução

### Desenvolvimento

```bash
npm run dev
```

### Produção local

```bash
npm run build
npm start
```

Após iniciar, a API fica disponível em:

- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api-docs`
- Painel: `http://localhost:3000/admin`

## Scripts disponíveis

```bash
npm run dev              # Desenvolvimento com hot reload
npm run build            # Compila src para dist
npm start                # Executa a versão compilada
npm test                 # Executa a suíte Vitest
npm run test:watch       # Executa os testes em modo watch
npm run test:coverage    # Gera relatório de cobertura
npm run test:integration # Executa o teste de integração de autenticação
```

## Testes

Os testes são escritos com Vitest e Supertest e cobrem autenticação, academias, avaliações, certificados, denúncias e middleware de autenticação.

```bash
npm test
npm run test:coverage
```

## Administração

Para criar o usuário administrador padrão ou informar credenciais próprias:

```bash
npx tsx scripts/create-admin.ts
```

Com parâmetros personalizados:

```bash
npx tsx scripts/create-admin.ts usuario@exemplo.com sua-senha "Nome do Administrador"
```

Sem parâmetros, o script usa:

- E-mail: `admin@tatamesafe.com.br`
- Senha: `TatameSafe@Admin123`
- Nome: `Admin Principal`

Recomenda-se trocar imediatamente a senha padrão em qualquer ambiente compartilhado.

## Endpoints principais

A base das rotas é `/api/v1`.

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/signup/aluno` | Cadastra um aluno |
| `POST` | `/auth/signup/academia` | Cadastra uma academia |
| `POST` | `/auth/signin` | Realiza login |
| `POST` | `/auth/signin/` | Realiza login |
| `POST` | `/auth/signout` | Confirma encerramento da sessão |

### Usuários e academias

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/users/me` | Retorna o usuário autenticado |
| `PATCH` | `/users/me` | Atualiza o perfil autenticado |
| `GET` | `/academias` | Lista academias |
| `GET` | `/academias/:id` | Obtém uma academia |

### Denúncias

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/denuncia` | Registra uma denúncia anônima |
| `GET` | `/denuncia/status/:protocolo` | Consulta status público e histórico |
| `POST` | `/denuncia/status/:protocolo/notificacoes` | Associa um token push ao protocolo |
| `GET` | `/denuncia/admin/stats` | Estatísticas administrativas |
| `GET` | `/denuncia/admin/sla` | Lista denúncias e seus estados de SLA |
| `GET` | `/denuncia/admin` | Lista denúncias com filtros |
| `GET` | `/denuncia/admin/:id` | Obtém detalhes de uma denúncia |
| `PATCH` | `/denuncia/admin/:id/status` | Atualiza o status |
| `PATCH` | `/denuncia/admin/:id/triagem` | Registra uma triagem |
| `PATCH` | `/denuncia/admin/:id/encaminhar` | Encaminha para entidade externa |
| `PATCH` | `/denuncia/admin/:id/operador` | Atribui um operador |

### Outros módulos

- `/avaliacoes`: avaliações de academias
- `/certificados`: certificados e selos
- `/crypto/public-key`: chave pública RSA para criptografar a descrição da denúncia

Consulte `/api-docs` para schemas, parâmetros, respostas e exemplos completos.

## Autenticação

O backend utiliza JWTs assinados por `JWT_SECRET`. O login e os cadastros retornam:

```json
{
  "session": {
    "access_token": "<jwt>",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": 1700003600
  }
}
```

Envie o token nas rotas protegidas:

```http
Authorization: Bearer <session.access_token>
```

Os JWT locais não são tokens emitidos pelo Supabase. Os painéis e integrações devem usar apenas o token retornado pela API.

## Segurança e privacidade

- Senhas locais armazenadas com bcrypt
- Descrição da denúncia recebida em formato criptografado
- Evidências enviadas ao Supabase Storage
- URLs de evidência geradas temporariamente
- Histórico público separado de notas internas
- Headers seguros fornecidos pelo Helmet
- CORS configurável por `CORS_ORIGIN`
- Logs configurados para remover dados sensíveis em produção
- Limite de 10 MB por arquivo de evidência
- Limite de payload aplicado à descrição criptografada

## Migrações

As migrações SQL disponíveis incluem:

- Campos administrativos e encaminhamento de denúncias
- Histórico público de notas por status
- Tokens de notificação push

Aplique-as no banco configurado antes de iniciar os recursos correspondentes.

## Estrutura da documentação

- Swagger: `swagger.yaml`
- Interface Swagger: `/api-docs`
- Painel administrativo: `/admin`
- Health check: `/health`
