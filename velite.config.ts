import { defineConfig, defineCollection, s } from "velite";
import rehypePrettyCode from "rehype-pretty-code";

// Content is plain markdown/MDX in /content. Velite validates frontmatter against
// these schemas at build time and emits typed JSON to .velite (imported via "#content").
// The frontend only ever sees the typed output, never the files.

// s.path() yields "projects/my-thing"; the slug is everything after the collection folder.
const fileSlug = (path: string) => path.split("/").slice(1).join("/");

const links = s
  .object({
    repo: s.string().url().optional(),
    demo: s.string().url().optional(),
    video: s.string().url().optional(),
    design: s.string().url().optional(),
    paper: s.string().url().optional(),
  })
  .default({});

const projects = defineCollection({
  name: "Project",
  pattern: "projects/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(120),
      slug: s.path(),
      description: s.string().max(280),
      date: s.isodate(),
      featured: s.boolean().default(false),
      draft: s.boolean().default(false),
      tags: s.array(s.string()).default([]),
      thumbnail: s.image().optional(),
      links,
      metadata: s.metadata(),
      body: s.mdx(),
    })
    .transform((data) => {
      const slug = fileSlug(data.slug);
      return { ...data, slug, permalink: `/projects/${slug}` };
    }),
});

const posts = defineCollection({
  name: "Post",
  pattern: "posts/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(120),
      slug: s.path(),
      description: s.string().max(280).optional(),
      date: s.isodate(),
      updated: s.isodate().optional(),
      draft: s.boolean().default(false),
      tags: s.array(s.string()).default([]),
      cover: s.image().optional(),
      metadata: s.metadata(),
      toc: s.toc(),
      body: s.mdx(),
    })
    .transform((data) => {
      const slug = fileSlug(data.slug);
      return { ...data, slug, permalink: `/blog/${slug}` };
    }),
});

// Singleton: who you are. Frontmatter = structured facts, body = the long-form bio.
const profile = defineCollection({
  name: "Profile",
  pattern: "profile/index.mdx",
  single: true,
  schema: s.object({
    name: s.string(),
    headline: s.string(),
    location: s.string().optional(),
    email: s.string().email().optional(),
    avatar: s.image().optional(),
    socials: s
      .array(s.object({ label: s.string(), url: s.string().url() }))
      .default([]),
    body: s.mdx(),
  }),
});

export default defineConfig({
  root: "content",
  output: {
    data: ".velite",
    assets: "public/static",
    base: "/static/",
    name: "[name]-[hash:6].[ext]",
    clean: true,
  },
  collections: { projects, posts, profile },
  mdx: {
    rehypePlugins: [[rehypePrettyCode, { theme: "github-dark-dimmed", keepBackground: false }]],
  },
});
