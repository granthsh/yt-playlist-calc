import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(165),
    pubDate: z.date(),
    tags: z.array(z.string()),
    order: z.number().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { blog };
