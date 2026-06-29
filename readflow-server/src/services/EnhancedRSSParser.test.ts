import { describe, expect, it } from 'vitest';
import { extractBestImageWithCaption, parseEnhancedRSS } from './EnhancedRSSParser';

describe('EnhancedRSSParser', () => {
  it('parses RSS items with media and enclosure fields', async () => {
    const feed = await parseEnhancedRSS(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Feed</title>
    <description>Example Description</description>
    <link>https://example.com</link>
    <item>
      <title>Example Article</title>
      <link>https://example.com/articles/1</link>
      <guid>article-1</guid>
      <author>Reporter</author>
      <pubDate>Mon, 29 Jun 2026 01:02:03 GMT</pubDate>
      <description><![CDATA[Short summary]]></description>
      <content:encoded><![CDATA[<p>Full content</p>]]></content:encoded>
      <enclosure url="https://example.com/fallback.jpg" type="image/jpeg" />
      <media:content url="https://example.com/cover.jpg" medium="image" width="1200" height="800">
        <media:description>Cover caption</media:description>
        <media:credit>Photo Desk</media:credit>
      </media:content>
    </item>
  </channel>
</rss>`);

    expect(feed.title).toBe('Example Feed');
    expect(feed.description).toBe('Example Description');
    expect(feed.links?.[0]?.url).toBe('https://example.com');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      id: 'article-1',
      title: 'Example Article',
      content: '<p>Full content</p>',
      published: 'Mon, 29 Jun 2026 01:02:03 GMT',
    });
    expect(feed.items[0].links?.[0]?.url).toBe('https://example.com/articles/1');
    expect(feed.items[0].authors?.[0]?.name).toBe('Reporter');
    expect(feed.items[0].enclosures?.[0]).toEqual({
      url: 'https://example.com/fallback.jpg',
      mimeType: 'image/jpeg',
    });

    const image = extractBestImageWithCaption(feed.items[0]);
    expect(image).toEqual({
      url: 'https://example.com/cover.jpg',
      caption: 'Cover caption',
      credit: 'Photo Desk',
      source: 'media:content',
    });
  });

  it('parses Atom entries and enclosure links', async () => {
    const feed = await parseEnhancedRSS(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <subtitle>Atom Description</subtitle>
  <link href="https://example.org/" />
  <entry>
    <id>tag:example.org,2026:1</id>
    <title>Atom Entry</title>
    <updated>2026-06-29T01:02:03Z</updated>
    <author><name>Atom Author</name></author>
    <link href="https://example.org/posts/1" rel="alternate" />
    <link href="https://example.org/image.png" rel="enclosure" type="image/png" />
    <summary>Atom summary</summary>
    <content type="html"><![CDATA[<p>Atom content</p>]]></content>
  </entry>
</feed>`);

    expect(feed.title).toBe('Atom Feed');
    expect(feed.description).toBe('Atom Description');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      id: 'tag:example.org,2026:1',
      title: 'Atom Entry',
      description: 'Atom summary',
      content: '<p>Atom content</p>',
      published: '2026-06-29T01:02:03Z',
    });
    expect(feed.items[0].links?.some(link => link.url === 'https://example.org/posts/1')).toBe(true);
    expect(feed.items[0].authors?.[0]?.name).toBe('Atom Author');
    expect(feed.items[0].enclosures?.[0]).toEqual({
      url: 'https://example.org/image.png',
      mimeType: 'image/png',
    });
  });
});
