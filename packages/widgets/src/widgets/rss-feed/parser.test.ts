import { describe, expect, it } from 'vitest';
import { FeedParseError, MAX_FEED_BYTES, parseFeedXml, sanitizeFeedLink } from './parser.js';

describe('rss-feed parser', () => {
  it('parses RSS 2.0, strips markup, validates links, and sorts newest-first', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title><![CDATA[<b>Homelab</b> &amp; Updates]]></title>
    <item>
      <title>Older &lt;em&gt;Release&lt;/em&gt;</title>
      <link>https://example.com/older</link>
      <pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate>
      <guid>older-1</guid>
    </item>
    <item>
      <title>Undated Item</title>
      <link>javascript:alert(1)</link>
      <guid isPermaLink="false">undated-1</guid>
    </item>
    <item>
      <title><![CDATA[<script>alert(1)</script>Newest <strong>Release</strong>]]></title>
      <link>https://example.com/newest</link>
      <dc:date>2026-11-17T12:00:00Z</dc:date>
      <guid>newest-1</guid>
    </item>
  </channel>
</rss>`;
    const parsed = parseFeedXml(xml, 5);
    expect(parsed.feedTitle).toBe('Homelab & Updates');
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).toMatchObject({
      id: 'newest-1',
      title: 'Newest Release',
      link: 'https://example.com/newest',
      publishedAt: Date.parse('2026-11-17T12:00:00Z'),
    });
    expect(parsed.entries[1]).toMatchObject({
      id: 'older-1',
      title: 'Older Release',
      link: 'https://example.com/older',
      publishedAt: Date.parse('Mon, 16 Nov 2026 10:00:00 GMT'),
    });
    expect(parsed.entries[2]).toMatchObject({
      id: 'undated-1',
      title: 'Undated Item',
      link: null,
      publishedAt: null,
    });
  });

  it('parses Atom 1.0 feeds with alternate links and enforces limit', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <id>tag:example.com,2026:1</id>
    <title type="html">&lt;p&gt;First Entry&lt;/p&gt;</title>
    <link rel="self" href="https://example.com/self/1" />
    <link rel="alternate" href="https://example.com/posts/1" />
    <published>2026-11-15T08:00:00Z</published>
  </entry>
  <entry>
    <id>tag:example.com,2026:2</id>
    <title>Second Entry</title>
    <link href="https://example.com/posts/2" />
    <updated>2026-11-17T09:30:00Z</updated>
  </entry>
</feed>`;
    const parsed = parseFeedXml(xml, 1);
    expect(parsed.feedTitle).toBe('Atom Feed');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual({
      id: 'tag:example.com,2026:2',
      title: 'Second Entry',
      link: 'https://example.com/posts/2',
      publishedAt: Date.parse('2026-11-17T09:30:00Z'),
    });
  });

  it('rejects XXE, DOCTYPE subsets, oversized inputs, and deep nesting', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<rss version="2.0"><channel><title>&xxe;</title></channel></rss>`;
    expect(() => parseFeedXml(xxe)).toThrow(FeedParseError);

    const entity = `<!ENTITY lol "lol"><rss version="2.0"><channel></channel></rss>`;
    expect(() => parseFeedXml(entity)).toThrow(FeedParseError);

    const oversized = `<rss version="2.0"><channel><title>${'a'.repeat(MAX_FEED_BYTES + 1)}</title></channel></rss>`;
    expect(() => parseFeedXml(oversized)).toThrow(FeedParseError);

    const deepOpen = '<a>'.repeat(40);
    const deepClose = '</a>'.repeat(40);
    expect(() => parseFeedXml(`${deepOpen}${deepClose}`)).toThrow(FeedParseError);

    expect(() => parseFeedXml('<html><body>Not a feed</body></html>')).toThrow(FeedParseError);
    expect(sanitizeFeedLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeFeedLink('https://user:pass@example.com/post')).toBeNull();
  });
});
