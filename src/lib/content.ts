// The single door between markdown and the frontend. Components import from here,
// never from "#content" directly, so drafts/sorting rules live in one place.
import { posts, projects, profile } from "#content";

const isProd = process.env.NODE_ENV === "production";
const visible = <T extends { draft: boolean }>(items: T[]) =>
  items.filter((i) => !isProd || !i.draft);
const byDateDesc = <T extends { date: string }>(a: T, b: T) =>
  +new Date(b.date) - +new Date(a.date);

export const getProfile = () => profile;

export const getProjects = () => visible(projects).sort(byDateDesc);
export const getFeaturedProjects = () => getProjects().filter((p) => p.featured);
export const getProject = (slug: string) => getProjects().find((p) => p.slug === slug);

export const getPosts = () => visible(posts).sort(byDateDesc);
export const getPost = (slug: string) => getPosts().find((p) => p.slug === slug);

export const getTags = () =>
  [...new Set([...getProjects(), ...getPosts()].flatMap((i) => i.tags))].sort();
