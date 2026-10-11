import * as THREE from 'three';
import type { PointerSnapshot, QualityProfile } from '../core/types';

export class ReaderRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly diagnosticPanel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private width = 1;
  private height = 1;
  private quality: QualityProfile;

  public constructor(canvas: HTMLCanvasElement, initialQuality: QualityProfile) {
    this.quality = initialQuality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0.2, 7);
    const geometry = new THREE.PlaneGeometry(4.6, 2.8, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xeadfc5, side: THREE.DoubleSide });
    this.diagnosticPanel = new THREE.Mesh(geometry, material);
    this.diagnosticPanel.rotation.x = -0.035;
    this.scene.add(this.diagnosticPanel);
  }

  public setQuality(profile: QualityProfile): void { this.quality = profile; this.resize(this.width, this.height); }
  public resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width)); this.height = Math.max(1, Math.floor(height));
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pixelRatio = Math.min(devicePixelRatio, this.quality.maxDevicePixelRatio) * this.quality.renderScale;
    this.renderer.setPixelRatio(Math.max(0.5, pixelRatio));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }
  public updatePointer(pointer: PointerSnapshot): void {
    const maxTilt = 0.08;
    this.diagnosticPanel.rotation.y = -pointer.normalizedX * maxTilt;
    this.diagnosticPanel.rotation.x = -0.035 + pointer.normalizedY * maxTilt * 0.35;
  }
  public render(): void { this.renderer.render(this.scene, this.camera); }
  public dispose(): void { this.diagnosticPanel.geometry.dispose(); this.diagnosticPanel.material.dispose(); this.renderer.dispose(); }
}
