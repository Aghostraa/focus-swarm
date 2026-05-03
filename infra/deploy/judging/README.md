# Cortex Judging Deployment

This is the judging setup:

- Vercel serves `packages/ui`.
- One always-on Fly.io Machine runs the live backend stack:
  - ENS gateway on internal `:8787`
  - AXL bridge nodes on internal `:9002`, `:9012`, `:9022`
  - protocol twins on internal `:9013`, `:9023`, `:9033`
  - public demo gateway on `:8080`

The public URL exposed to judges is the Vercel UI. Vercel sets `CORTEX_DEMO_API` and proxies all live calls to the Fly backend.

## 1. Provide Linux AXL Binary

The checked-in `infra/axl/bin/node` is macOS-only. For Fly/Linux, build or copy a Linux AXL binary here:

```bash
infra/axl/bin/node-linux
chmod +x infra/axl/bin/node-linux
```

The backend container uses:

```bash
AXL_BIN=/app/infra/axl/bin/node-linux
```

## 2. Deploy Backend On Fly

```bash
fly launch --copy-config --config infra/deploy/judging/fly.toml
fly secrets set \
  PRIVATE_KEY=0x... \
  ENS_GATEWAY_SIGNER_KEY=0x... \
  ZG_RPC_URL=https://evmrpc-testnet.0g.ai \
  ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai \
  ZG_KV_NODE_URL=http://3.101.147.150:6789
fly deploy --config infra/deploy/judging/fly.toml
```

Check backend health:

```bash
curl https://cortex-judging-demo.fly.dev/health
curl https://cortex-judging-demo.fly.dev/status
```

## 3. Deploy UI On Vercel

Use `packages/ui` as the Vercel project root.

Set this environment variable:

```bash
CORTEX_DEMO_API=https://cortex-judging-demo.fly.dev
```

Then deploy:

```bash
vercel --cwd packages/ui
```

The UI routes stay the same:

```text
/protocol-twins
/api/cortex-demo/status
/api/cortex-demo/ask
/api/cortex-demo/project
/api/cortex-demo/session/:projectId
```

In local development, when `CORTEX_DEMO_API` is unset, those routes call local services on `127.0.0.1`.

## Proof Links

The UI includes first-class proof links for:

- iNFT contract: `0x1f45c631456f55da565fcb5e8e063a0dd4b6380b`
- OffchainResolver: `0xab32d4b316be27ce47fcbf92a321f24b22c49121`
- known mint tx: `0x06482bfd93b50bd7ec5e2b1cb95c0de759ea4d68c9dac6c8fee0497eea7fde1b`
- 0G Storage submission `74270` for brain root `0xd848987575b432d37bcdacc7daee75087946a0309ca250013d950d361899ae15`
- live ENS text-record JSON
- live AXL topology JSON
- live twin runtime JSON
