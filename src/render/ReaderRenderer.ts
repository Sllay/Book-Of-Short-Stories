import * as THREE from 'three';
import { BookRenderer } from '../book/BookRenderer';
import type { PointerSnapshot, QualityProfile } from '../core/types';

export class ReaderRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly book = new BookRenderer();
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
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;

    const hemisphere = new THREE.HemisphereLight(0xfff4dc, 0x6e5b4a, 1.55);
    const keyLight = new THREE.DirectionalLight(0xffe1b0, 1.75);
    keyLight.position.set(3.8, 4.2, 6.5);

    this.scene.add(hemisphere, keyLight, this.book.root);
    this.applyCameraPose();
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

    const devicePixelRatio = window.devicePixelRatio || 1;
    const pixelRatio = Math.min(devicePixelRatio, this.quality.maxDevicePixelRatio) * this.quality.renderScale;

    this.renderer.setPixelRatio(Math.max(1, pixelRatio));
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
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.book.dispose();
    this.renderer.dispose();
  }

  private applyCameraPose(): void {
    const portraitLike = this.camera.aspect < 1.2;
    const farZ = portraitLike ? 8.9 : 7.35;
    const nearZ = portraitLike ? 6.65 : 5.45;
    const z = THREE.MathUtils.lerp(farZ, nearZ, this.zoom);

    this.camera.position.set(0, portraitLike ? 0.08 : 0.12, z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }
}
