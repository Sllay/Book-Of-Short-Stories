import * as THREE from 'three';
import type { PaginatedPage, TypographySettings } from '../pagination/types';
import { createPageTexture } from './PageTextureFactory';

export interface BookPageSource {
  readonly pageCount: number;
  getTexture(pageIndex: number): THREE.Texture;
  warmAround(pageIndex: number): void;
  dispose(): void;
}

interface CacheEntry {
  readonly texture: THREE.Texture;
  lastUsed: number;
}

export class PageTextureCache implements BookPageSource {
  private readonly cache = new Map<number, CacheEntry>();
  private readonly blankTexture: THREE.Texture;
  private readonly warmTimers = new Set<number>();
  private usageTick = 0;

  public constructor(
    private readonly pages: readonly PaginatedPage[],
    private readonly settings: TypographySettings,
    private readonly maxEntries = 14
  ) {
    this.blankTexture = createPageTexture(null, settings);
  }

  public get pageCount(): number { return this.pages.length; }

  public getTexture(pageIndex: number): THREE.Texture {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return this.blankTexture;

    const existing = this.cache.get(pageIndex);
    if (existing) {
      existing.lastUsed = ++this.usageTick;
      return existing.texture;
    }

    const texture = createPageTexture(this.pages[pageIndex], this.settings, pageIndex + 1);
    this.cache.set(pageIndex, { texture, lastUsed: ++this.usageTick });
    this.evictIfNeeded();
    return texture;
  }

  public warmAround(pageIndex: number): void {
    const candidates = [pageIndex - 3, pageIndex - 2, pageIndex - 1, pageIndex, pageIndex + 1, pageIndex + 2, pageIndex + 3, pageIndex + 4]
      .filter((index) => index >= 0 && index < this.pages.length && !this.cache.has(index));

    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = candidates[offset];
      const timer = window.setTimeout(() => {
        this.warmTimers.delete(timer);
        this.getTexture(index);
      }, offset * 18);
      this.warmTimers.add(timer);
    }
  }

  public dispose(): void {
    for (const timer of this.warmTimers) window.clearTimeout(timer);
    this.warmTimers.clear();

    for (const entry of this.cache.values()) entry.texture.dispose();
    this.cache.clear();
    this.blankTexture.dispose();
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;

    const entries = [...this.cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.cache.size > this.maxEntries && entries.length > 0) {
      const oldest = entries.shift();
      if (!oldest) break;
      this.cache.delete(oldest[0]);
      oldest[1].texture.dispose();
    }
  }
}
