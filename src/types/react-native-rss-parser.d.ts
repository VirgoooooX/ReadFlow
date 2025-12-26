declare module 'react-native-rss-parser' {
  export interface Feed {
    title: string;
    description: string;
    authors: Author[];
    links: Link[];
    image: Image;
    items: Item[];
    itunes?: any;
  }

  export interface Author {
    name: string;
  }

  export interface Link {
    url: string;
    rel?: string;
  }

  export interface Image {
    url: string;
    title: string;
  }

  export interface Item {
    id: string;
    title: string;
    description: string;
    content: string;
    published: string;
    authors: Author[];
    links: Link[];
    enclosures: Enclosure[];
    itunes?: any;
    [key: string]: any;
  }

  export interface Enclosure {
    url: string;
    mimeType: string;
    length?: string;
  }

  export function parse(xml: string): Promise<Feed>;
}
