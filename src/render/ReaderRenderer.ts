import * as THREE from 'three';
import { BookRenderer, type PageTurnDirection, type PageTurnMotion } from '../book/BookRenderer';
import type { BookPageSource } from '../book/PageTextureCache';
import type { PointerSnapshot, QualityProfile } from '../core/types';
import { ReadingWorldController } from '../world/ReadingWorldController';

const MAX_FRAMEBUFFER_PIXELS = 4_200_000;

export class ReaderRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly book = new BookRenderer();
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
    this.scene.add(this.world.root, this.hemisphere, this.keyLight, this.book.root);
    this.applyCameraPose();
  }

  public get currentPageIndex(): number { return this.book.currentLeftPageIndex; }

  public setPageChangeListener(listener: ((leftPageIndex: number) => void) | null): void {
    this.book.setPageChangeListener(listener);
  }

  public setTurnCompleteListener(listener: ((direction: PageTurnDirection) => void) | null): void {
    this.book.setTurnCompleteListener(listener);
  }

  public setTurnMotionListener(listener: ((motion: PageTurnMotion) => void) | null): void {
    this.book.setTurnMotionListener(listener);
  }

  public setPublication(source: BookPageSource, initialPageIndex = 0): void {
    this.book.setPageSource(source, initialPageIndex);
  }

  public setReducedMotion(enabled: boolean): void {
    this.book.setReducedMotion(enabled);
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
    return this.book.handlePointer(pointer, this.camera);
  }

  public update(deltaMs: number): boolean {
    return this.book.update(deltaMs);
  }

  public cancelInteraction(): void {
    this.book.cancelInteraction();
  }

  public render(): void {
    // The world is deliberately static most of the time. The clock only refreshes
    // when a render is already happening, so time-of-day costs no continuous RAF.
    this.world.refreshClock();
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
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
    const farZ = portraitLike ? 8.85 : 7.6;
    const nearZ = portraitLike ? 6.55 : 5.25;
    const z = THREE.MathUtils.lerp(farZ, nearZ, this.zoom);

    // Pulled back: camera sits on the reader side and looks slightly toward the
    // wall/mirror, revealing the environment. Zooming in smoothly moves toward a
    // near top-down reading pose so the book stays comfortable to read.
    const farY = portraitLike ? -1.0 : -1.72;
    const nearY = portraitLike ? -0.08 : 0.04;
    const cameraY = THREE.MathUtils.lerp(farY, nearY, this.zoom);
    const lookY = THREE.MathUtils.lerp(portraitLike ? 0.32 : 0.58, 0, this.zoom);

    this.camera.position.set(0, cameraY, z);
    this.camera.lookAt(0, lookY, -0.03);
    this.camera.updateMatrixWorld();
  }
}
