# Knowledge Challenge

Knowledge Challenge is a local-first, static knowledge game. Each round presents ten Chinese multiple-choice questions—one from each knowledge category—and scores correct answers by response time.

The repository includes a single 35,000-question local bank stored in the browser-ready static format.

**[Play it here.](https://mikeyan01.github.io/Quiz/)**

## Run locally

Requires a current Node.js release.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

Development and production builds read `public/data/knowledge-35000-v3/` directly.

Every push to `main` is typechecked, tested, built, and deployed to GitHub
Pages by `.github/workflows/deploy.yml`. GitHub Pages serves this project under
`/Quiz/`, so production asset and question-bank URLs use that base path while
the local development server keeps `/`.

## Quality checks

```bash
npm test
npm run test:e2e
npm run typecheck
npm run check:all
```

## Question-bank workflow

[`public/data/knowledge-35000-v3/`](public/data/knowledge-35000-v3/) is the only persistent question source. The app and tests read its manifest and shards directly; no editable JSONL or development-bank copy is retained.

See the [product specification](docs/product-spec.md#数据模型与静态发布) for the format and future expansion rule.
