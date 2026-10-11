import * as THREE from 'three';
import type { PointerSnapshot } from '../core/types';
import { PageCurlSheet } from './PageCurlSheet';
import { createDemoPageTexture } from './PageTextureFactory';

const PAGE_WIDTH = 2.3;
const PAGE_HEIGHT = 2.95;
const DRAG_DISTANCE_NDC = 1.05;

export class BookRenderer {
  public readonly root = new THREE.Group();

  private readonly textures: THREE.Texture[] = [];
  private readonly staticGeometries: THREE.BufferGeometry[] = [];
  private readonly staticMaterials: THREE.Material[] = [];
  private readonly turningSheet: PageCurlSheet;
  private readonly hitRight: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly hitLeft: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private progress = 0;
  private twist = 0;
  private pointerWasDown = false;
  private dragging = false;
  private animating = false;
  private dragStartX = 0;
  private dragStartProgress = 0;
  private animationStart = 0;
  private animationTarget = 0;
  private animationElapsedMs = 0;
  private animationDurationMs = 280;

  public constructor() {
    this.root.rotation.x = -0.08;
    this.root.position.y = -0.04;

    const coverMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x5a3526, roughness: 0.86, metalness: 0 }));
    const coverGeometry = this.trackGeometry(new THREE.BoxGeometry(5.02, 3.28, 0.12));
    const cover = new THREE.Mesh(coverGeometry, coverMaterial);
    cover.position.z = -0.18;
    this.root.add(cover);

    const blockMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xd7cdb8, roughness: 0.95 }));
    const blockGeometry = this.trackGeometry(new THREE.BoxGeometry(4.72, 3.02, 0.16));
    const pageBlock = new THREE.Mesh(blockGeometry, blockMaterial);
    pageBlock.position.z = -0.075;
    this.root.add(pageBlock);

    const leftTexture = this.trackTexture(createDemoPageTexture(2, 'Book of Short Stories'));
    const rightUnderTexture = this.trackTexture(createDemoPageTexture(5, 'Physical Reading Prototype'));
    const frontTexture = this.trackTexture(createDemoPageTexture(3, 'Drag this page'));
    const backTexture = this.trackTexture(createDemoPageTexture(4, 'The reverse side'));

    const leftPage = this.createStaticPage(leftTexture);
    leftPage.position.set(-PAGE_WIDTH / 2, 0, 0.025);
    this.root.add(leftPage);

    const rightUnderPage = this.createStaticPage(rightUnderTexture);
    rightUnderPage.position.set(PAGE_WIDTH / 2, 0, 0.027);
    this.root.add(rightUnderPage);

    const gutterMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xb9aa91, transparent: true, opacity: 0.42 }));
    const gutterGeometry = this.trackGeometry(new THREE.PlaneGeometry(0.055, PAGE_HEIGHT * 0.985));
    const gutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    gutter.position.z = 0.045;
    this.root.add(gutter);

    this.turningSheet = new PageCurlSheet(PAGE_WIDTH, PAGE_HEIGHT, frontTexture, backTexture);
    this.turningSheet.mesh.position.z = 0.055;
    this.root.add(this.turningSheet.mesh);

    this.hitRight = this.createHitSurface(PAGE_WIDTH / 2);
    this.hitLeft = this.createHitSurface(-PAGE_WIDTH / 2);
    this.root.add(this.hitRight, this.hitLeft);
  }

  public handlePointer(pointer: PointerSnapshot, camera: THREE.Camera): boolean {
    if (pointer.isDown && !this.pointerWasDown) this.beginDrag(pointer, camera);
    else if (pointer.isDown && this.dragging) this.updateDrag(pointer);
    else if (!pointer.isDown && this.pointerWasDown && this.dragging) this.endDrag();

    this.pointerWasDown = pointer.isDown;
    return this.dragging || this.animating;
  }

  public update(deltaMs: number): boolean {
    if (!this.animating) return this.dragging;

    this.animationElapsedMs += Math.max(0, deltaMs);
    const rawT = THREE.MathUtils.clamp(this.animationElapsedMs / this.animationDurationMs, 0, 1);
    const eased = 1 - Math.pow(1 - rawT, 3);
    this.progress = THREE.MathUtils.lerp(this.animationStart, this.animationTarget, eased);
    this.twist = THREE.MathUtils.lerp(this.twist, 0, Math.min(1, rawT * 0.22 + 0.08));
    this.applySheetState();

    if (rawT >= 1) {
      this.progress = this.animationTarget;
      this.twist = 0;
      this.animating = false;
      this.applySheetState();
    }

    return this.dragging || this.animating;
  }

  public cancelInteraction(): void {
    this.pointerWasDown = false;
    this.dragging = false;
    this.animating = false;
    this.twist = 0;
    this.progress = this.progress >= 0.5 ? 1 : 0;
    this.applySheetState();
  }

  public dispose(): void {
    this.turningSheet.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.staticGeometries) geometry.dispose();
    for (const material of this.staticMaterials) material.dispose();
  }

  private beginDrag(pointer: PointerSnapshot, camera: THREE.Camera): void {
    this.pointerNdc.set(pointer.normalizedX, pointer.normalizedY);
    this.raycaster.setFromCamera(this.pointerNdc, camera);

    const target = this.progress < 0.5 ? this.hitRight : this.hitLeft;
    const hit = this.raycaster.intersectObject(target, false).length > 0;
    if (!hit) return;

    this.animating = false;
    this.dragging = true;
    this.dragStartX = pointer.normalizedX;
    this.dragStartProgress = this.progress;
    this.twist = THREE.MathUtils.clamp(pointer.normalizedY * 0.7, -0.7, 0.7);
    this.applySheetState();
  }

  private updateDrag(pointer: PointerSnapshot): void {
    const delta = (this.dragStartX - pointer.normalizedX) / DRAG_DISTANCE_NDC;
    this.progress = THREE.MathUtils.clamp(this.dragStartProgress + delta, 0, 1);
    this.twist = THREE.MathUtils.clamp(pointer.normalizedY * 0.7, -0.7, 0.7);
    this.applySheetState();
  }

  private endDrag(): void {
    this.dragging = false;
    this.animating = true;
    this.animationStart = this.progress;
    this.animationTarget = this.progress >= 0.5 ? 1 : 0;
    this.animationElapsedMs = 0;
    const remaining = Math.abs(this.animationTarget - this.animationStart);
    this.animationDurationMs = 180 + remaining * 260;
  }

  private applySheetState(): void {
    this.turningSheet.setProgress(this.progress);
    this.turningSheet.setTwist(this.twist);
  }

  private createStaticPage(texture: THREE.Texture): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const geometry = this.trackGeometry(new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT));
    const material = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide
    }));
    return new THREE.Mesh(geometry, material);
  }

  private createHitSurface(x: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const geometry = this.trackGeometry(new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT));
    const material = this.trackMaterial(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    material.colorWrite = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0, 0.12);
    mesh.renderOrder = -1;
    return mesh;
  }

  private trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.staticGeometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.staticMaterials.push(material);
    return material;
  }
}
