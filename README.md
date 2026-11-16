# silvia website v2

Static portfolio. No database, no CMS: content is markdown in git.

**Stack:** Next.js (App Router) · Tailwind · [Velite](https://velite.js.org) for typed markdown content

## Content

All content lives in `content/` and is validated against schemas in `velite.config.ts`.

| Folder | What | Frontmatter highlights |
| --- | --- | --- |
| `content/projects/*.mdx` | Portfolio projects | title, description, date, featured, tags, thumbnail, links (repo/demo/video/design/paper) |
| `content/posts/*.mdx` | Blog posts | title, date, tags, cover, auto TOC |
| `content/profile/index.mdx` | Singleton about/profile | name, headline, socials, avatar |

Set `draft: true` to hide an entry in production. Bad frontmatter fails the build.

Frontend code reads content only through `src/lib/content.ts` (`getProjects()`, `getPost(slug)`, ...). Render a body with `<MDXContent code={post.body} />`; register custom MDX components in `src/components/mdx.tsx`.

## Commands

Requires Node 24 (`.nvmrc`) and pnpm.

```bash
pnpm dev       # content watcher + next dev
pnpm build     # velite build + next build
pnpm content   # rebuild typed content only
pnpm lint
pnpm typecheck # content + tsc
```
