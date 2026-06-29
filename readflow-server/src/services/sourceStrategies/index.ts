import { RSSSource } from '../../types';
import { SourceParseStrategy } from './types';
import { xchuxingStrategy } from './xchuxingStrategy';
import { dongqiudiStrategy } from './dongqiudiStrategy';

const strategies: SourceParseStrategy[] = [
  xchuxingStrategy,
  dongqiudiStrategy,
];

export function findSourceStrategy(url: string, source: RSSSource): SourceParseStrategy | undefined {
  try {
    const urlObj = new URL(url);
    return strategies.find(strategy => strategy.match(urlObj, { source }));
  } catch {
    return undefined;
  }
}

export type { SourceParseStrategy } from './types';
