import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET() {
  const posts = await getCollection("blog");
  posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: "ytplaylistcalc.pro — Guides & Tutorials",
    description: "Learn how to calculate YouTube playlist length, sort videos, download HD thumbnails, plan study deadlines, and more.",
    site: "https://ytplaylistcalc.pro",
    items: posts.map(post => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: `<language>en-us</language>`,
  });
}
