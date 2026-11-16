import * as runtime from "react/jsx-runtime";
import type { ComponentType, ReactNode } from "react";

type MDXComponents = Record<string, ComponentType<never>>;
type CompiledMDX = (props: { components?: MDXComponents }) => ReactNode;

// Velite compiles MDX to a function body string. Evaluating it yields the MDX
// content function, which we call directly (not mount as <Component />) so no
// component identity is created per render.
const compile = (code: string) => new Function(code)({ ...runtime }).default as CompiledMDX;

// Register custom components (the v1 CodeBlock / Disclaimer equivalents) here.
const components: MDXComponents = {};

export function MDXContent({ code }: { code: string }) {
  return compile(code)({ components });
}
