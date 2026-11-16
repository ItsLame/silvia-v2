import { MDXContent } from "@/components/mdx";
import { getPosts, getProfile, getProjects } from "@/lib/content";

// Placeholder: proves content flows end to end. Real design comes later.
export default function Home() {
  const profile = getProfile();
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <header>
        <h1 className="text-3xl font-semibold">{profile.name}</h1>
        <p className="text-neutral-500">{profile.headline}</p>
      </header>
      <MDXContent code={profile.body} />
      <section>
        <h2 className="font-medium">Projects</h2>
        <ul>{getProjects().map((p) => <li key={p.slug}>{p.title}: {p.description}</li>)}</ul>
      </section>
      <section>
        <h2 className="font-medium">Posts</h2>
        <ul>{getPosts().map((p) => <li key={p.slug}>{p.title}</li>)}</ul>
      </section>
    </main>
  );
}
