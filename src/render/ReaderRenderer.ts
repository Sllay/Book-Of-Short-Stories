import * as THREE from 'three';
import { BookPresentationController, type BookCloseReason, type BookCoverArtwork } from '../book/BookPresentationController';
import { BookRenderer, type PageTurnDirection, type PageTurnMotion } from '../book/BookRenderer';
import type { BookPageSource } from '../book/PageTextureCache';
import type { PointerSnapshot, QualityProfile } from '../core/types';
import type { PageTheme } from '../pagination/types';
import { ReadingWorldController } from '../world/ReadingWorldController';

const MAX_FRAMEBUFFER_PIXELS = 4_200_000;

export class ReaderRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly book = new BookRenderer();
  private readonly presentation = new BookPresentationController(this.book);
  private readonly hemisphere = new THREE.HemisphereLight(0xfff4dc, 0x6e5b4a, 1.55);
  private readonly keyLight = new THREE.DirectionalLight(0xffe1b0, 1.75);
  private readonly world: ReadingWorldController;
  private width = 1;
  private height = 1;
  private zoom = 0.55;
  private quality: QualityProfile;

  public constructor(canvas: HTMLCanvasElement, initialQuality: QualityProfile) {
    this.quality = initialQuality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'default'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0d0b09, 1);
    this.renderer.shadowMap.enabled = false;

    this.world = new ReadingWorldController(this.hemisphere, this.keyLight);
    this.scene.add(this.world.root, this.hemisphere, this.keyLight, this.presentation.root);
    this.applyCameraPose();
  }

  public get currentPageIndex(): number { return this.book.currentLeftPageIndex; }
  public get isBookClosed(): boolean { return this.presentation.isClosed; }

  public setPageChangeListener(listener: ((leftPageIndex: number) => void) | null): void {
    this.book.setPageChangeListener((pageIndex) => {
      this.presentation.setCurrentPage(pageIndex);
      listener?.(pageIndex);
    });
  }

  public setTurnCompleteListener(listener: ((direction: PageTurnDirection) => void) | null): void {
    this.book.setTurnCompleteListener(listener);
  }

  public setTurnMotionListener(listener: ((motion: PageTurnMotion) => void) | null): void {
    this.book.setTurnMotionListener(listener);
  }

  public setClosedBookOpenListener(listener: ((reason: BookCloseReason) => void) | null): void {
    this.presentation.setOpenRequestListener(listener);
  }

  public setFinishedBookListener(listener: (() => void) | null): void {
    this.presentation.setFinishRequestListener(listener);
  }

  public setBookmarkActivateListener(listener: ((pageIndex: number) => void) | null): void {
    this.presentation.setBookmarkRequestListener(listener);
  }

  public setPublication(source: BookPageSource, initialPageIndex = 0): void {
    this.book.setPageSource(source, initialPageIndex);
    this.presentation.setCurrentPage(this.book.currentLeftPageIndex);
  }

  public setCurrentPage(pageIndex: number): void {
    this.book.setCurrentPage(pageIndex);
    this.presentation.setCurrentPage(this.book.currentLeftPageIndex);
  }

  public jumpToPage(pageIndex: number): boolean {
    return this.book.jumpToPage(pageIndex);
  }

  public setCoverArtwork(artwork: BookCoverArtwork | null): void {
    this.presentation.setCoverArtwork(artwork);
    this.book.setCoverEdgeColor(artwork?.edgeColor ?? 0x5a3526);
  }

  public setBookmark(pageIndex: number | null, color: string): void {
    this.presentation.setBookmark(pageIndex, color);
  }

  public closeBook(reason: BookCloseReason, instant = false): void {
    this.presentation.close(reason, instant);
  }

  public openBook(): void {
    this.presentation.open();
  }

  public setReducedMotion(enabled: boolean): void {
    this.book.setReducedMotion(enabled);
  }

  public setPageTurnTranslucency(enabled: boolean): void {
    this.book.setPageTurnTranslucency(enabled);
  }

  public setPageTheme(theme: PageTheme): void {
    this.book.setPageTheme(theme);
  }

  public setFocusMode(enabled: boolean): void {
    this.world.setFocusMode(enabled);
  }

  public setQuality(profile: QualityProfile): void {
    this.quality = profile;
    this.resize(this.width, this.height);
  }

  public setZoom(value: number): void {
    this.zoom = THREE.MathUtils.clamp(value, 0, 1);
    this.applyCameraPose();
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));

    this.renderer.setPixelRatio(this.computePixelRatio());
    this.renderer.setSize(this.width, this.height, false);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.applyCameraPose();
  }

  public updatePointer(pointer: PointerSnapshot): boolean {
    if (pointer.isDown) this.world.notifyUserGesture();
    const presentationActive = this.presentation.handlePointer(pointer, this.camera, this.book.atEnd);
    if (presentationActive || this.presentation.isClosed || this.presentation.isAnimating) {
      return presentationActive || this.presentation.isAnimating;
    }
    return this.book.handlePointer(pointer, this.camera);
  }

  public update(deltaMs: number): boolean {
    this.world.update(deltaMs);
    const bookActive = this.book.update(deltaMs);
    const presentationActive = this.presentation.update(deltaMs);
    return bookActive || presentationActive;
  }

  public cancelInteraction(): void {
    this.book.cancelInteraction();
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.presentation.dispose();
    this.book.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private computePixelRatio(): number {
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const requested = Math.min(devicePixelRatio, this.quality.maxDevicePixelRatio) * this.quality.renderScale;
    const cssPixels = Math.max(1, this.width * this.height);
    const budgetRatio = Math.sqrt(MAX_FRAMEBUFFER_PIXELS / cssPixels);
    return THREE.MathUtils.clamp(Math.min(requested, budgetRatio), 1, 2.35);
  }

  private applyCameraPose(): void {
    const portraitLike = this.camera.aspect < 1.2;
    const easedZoom = THREE.MathUtils.smoothstep(this.zoom, 0, 1);

    const farZ = portraitLike ? 8.75 : 7.55;
    const nearZ = portraitLike ? 6.5 : 5.23;
    const farY = portraitLike ? -0.72 : -1.12;
    const nearY = portraitLike ? -0.03 : 0.02;
    const farX = portraitLike ? -0.12 : -0.38;
    const nearX = 0;

    const z = THREE.MathUtils.lerp(farZ, nearZ, easedZoom);
    const cameraY = THREE.MathUtils.lerp(farY, nearY, easedZoom);
    const cameraX = THREE.MathUtils.lerp(farX, nearX, easedZoom);
    const lookX = THREE.MathUtils.lerp(portraitLike ? 0.06 : 0.24, 0, easedZoom);
    const lookY = THREE.MathUtils.lerp(portraitLike ? 0.22 : 0.42, 0, easedZoom);

    this.camera.fov = THREE.MathUtils.lerp(portraitLike ? 33 : 34, portraitLike ? 30.5 : 29.5, easedZoom);
    this.camera.position.set(cameraX, cameraY, z);
    this.camera.lookAt(lookX, lookY, -0.04);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}
