# Carteira Cripto

Dashboard com login para acompanhar a carteira de criptoativos (aba **Cripto**) e as contas em Real (aba **$**: conta PF, conta PJ, caixinhas…). Cada pessoa vê só os próprios dados. Os dois dashboards podem ser vistos em **USDT, BTC ou BRL**; preços e cotações vêm da API pública da Binance (sem chave).

Next.js 16 · SQLite (Drizzle) · Tailwind + shadcn/ui · Recharts.

## Desenvolvimento

```bash
npm install
npm run create-admin      # pergunta usuário e senha do primeiro admin
npm run dev               # http://localhost:3000
```

Testes:

```bash
npm test                  # unidade e integração (Vitest)
npx playwright install chromium
npm run test:e2e          # ponta a ponta (Binance simulada)
```

## Deploy no Easypanel

### 1. Preços (Binance)

Não precisa de chave. O app usa a API pública de dados de mercado da Binance (`data-api.binance.vision`).

- Só entram moedas negociadas na Binance contra **USDT**. O preço em USDT é tratado como dólar (1 USDT ≈ US$ 1).
- A Binance bloqueia alguns países, como os **EUA**. Se a VPS estiver num deles, os preços não carregam: escolha uma VPS em outra região ou aponte `BINANCE_BASE_URL` para outro endpoint compatível.

### 2. Criar o serviço

1. No Easypanel, crie um **App** apontando para este repositório Git (GitHub ou GitLab).
2. Em **Build**, escolha **Dockerfile** (o arquivo `Dockerfile` da raiz).
3. Deixe **1 réplica**. O banco é um arquivo SQLite e não pode ser dividido entre containers.
4. Em **Mounts**, adicione um **Volume** montado em `/app/data`. **Sem esse volume, todos os dados somem a cada deploy.**
5. Em **Domains**, configure seu domínio. O Easypanel cuida do HTTPS. A porta do domínio precisa ser a mesma em que o app escuta. O Easypanel costuma definir `PORT=80` sozinho, e o log mostra `Local: http://localhost:80`. Nesse caso, use **80**. Se o log mostrar outra porta (sem a variável, o padrão do Dockerfile é `3000`), use essa. Com portas diferentes, o site não abre.

### 3. Variáveis de ambiente

| Variável | Valor | Quando |
|---|---|---|
| `ADMIN_USERNAME` | ex.: `pedro` | só no 1º deploy |
| `ADMIN_PASSWORD` | senha forte (mín. 8) | só no 1º deploy |
| `APP_DOMAIN` | ex.: `carteira.seudominio.com` | opcional: use se as ações de formulário derem erro de origem. É lido **no build**: defina também em *Build Args* |
| `TRUSTED_PROXY_HOPS` | `1` (padrão) ou `2` com Cloudflare na frente | opcional |
| `APP_TIMEZONE` | `America/Sao_Paulo` (padrão) | opcional |
| `BINANCE_BASE_URL` | `https://data-api.binance.vision` (padrão) | opcional |

No primeiro start, se o banco estiver vazio, o app cria o administrador com `ADMIN_USERNAME`/`ADMIN_PASSWORD` e mostra no log `Administrador inicial criado: <usuario>`. **Depois do primeiro login, apague essas duas variáveis** no Easypanel.

Os demais usuários são criados na tela **Admin**. Não há cadastro público.

### 4. Backup

O banco fica no volume, em `/app/data/app.db`. Há duas formas de fazer backup:

- **Pelo console do serviço no Easypanel:**
  ```bash
  node scripts/backup.mjs
  ```
  O comando gera `/app/data/backups/app-AAAA-MM-DD.db`, uma cópia segura mesmo com o app rodando. Baixe o arquivo pelo Easypanel ou copie para fora da VPS.
- **Pelo backup de volumes do Easypanel**, se estiver disponível no seu plano.

Faça backup com regularidade: perder o volume apaga todas as carteiras e contas.

### Segurança, em resumo

- As senhas são guardadas com argon2. O cookie de sessão é `httpOnly`, `secure` e `__Host-`, e o banco guarda só o hash da sessão.
- Depois de 5 erros de senha, a conta fica bloqueada por 15 min. O admin pode desbloquear antes.
- Cada IP tem um limite de 20 falhas de login a cada 15 min. O IP vem do cabeçalho que o proxy do Easypanel acrescenta.
- Para quem tenta entrar, conta bloqueada e senha errada mostram a mesma mensagem.

## Atualizar o app no Easypanel

1. **Faça um backup antes:** no console do serviço, rode . As atualizações que mudam o banco (como as tabelas do fiduciário) aplicam a mudança sozinhas ao iniciar, e o backup é a garantia caso algo dê errado.
2. Envie o código para o GitHub ().
3. No Easypanel, clique em **Implantar** e acompanhe os logs até aparecer .
