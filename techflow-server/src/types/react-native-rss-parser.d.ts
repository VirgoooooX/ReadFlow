declare module 'react-native-rss-parser' {
  export interface RSSItem {
    id?: string;
    title?: string;
    description?: string;
    content?: string;
    links?: Array<{ url: string }>;
    published?: string;
    authors?: Array<{ name?: string }>;
    enclosures?: Array<{ url: string; mimeType?: string }>;
    [key: string]: any;
  }

  export interface RSSFeed {
    title?: string;
    description?: string;
    links?: Array<{ url: string }>;
    items: RSSItem[];
    [key: string]: any;
  }

  export function parse(xml: string): Promise<RSSFeed>;
}
