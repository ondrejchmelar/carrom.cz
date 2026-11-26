import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// News: content/articles/<year>/<date>-<slug>.<lang>.md
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/articles', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    perex: z.string().optional(),
    publish_at: z.coerce.date().optional(),
    status: z.enum(['draft', 'published']).default('published'),
    pinned: z.boolean().default(false),
    cover: z.string().optional(),
    edition: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

// Fixed pages: content/pages/<slug>.<lang>.md. Menus live in data/navigation.yaml.
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/pages', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    layout: z.enum(['text', 'text-sidebar', 'gallery']).default('text'),
    parent: z.string().nullable().optional(),
    description: z.string().optional(),
  }),
});

export const collections = { articles, pages };
