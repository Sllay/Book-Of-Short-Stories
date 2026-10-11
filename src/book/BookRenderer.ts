import * as THREE from 'three';
import type { PointerSnapshot } from '../core/types';
import type { BookPageSource } from './PageTextureCache';
import { PageCurlSheet } from './PageCurlSheet';

const PAGE_WIDTH = 2.3;
const PAGE_HEIGHT = 2.95;
const DRAG_DISTANCE_NDC = 1.05;

type TurnDirection = 'forward' | 'backward';

export class BookRenderer {
  public readonly root = new THREE.Group();

  private readonly staticGeometries: THREE.BufferGeometry[] = [];
  private readonly staticMaterials: THREE.Material[] = [];
  private readonly leftPageMaterial: THREE.MeshStandardMaterial;
  private readonly rightPageMaterial: THREE.MeshStandardMaterial;
  private readonly turningSheet: PageCurlSheet;
  private readonly hitRight: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly hitLeft: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly fallbackTexture: THREE.DataTexture;

  private pageSource: BookPageSource | null = null;
  private spreadLeftIndex = 0;
  private progress = 0;
  private grabX = 0.9;
  private grabY = 0.5;
  private twist = 0;
  private dragAmount = 0;
  private pointerWasDown = false;
  private dragging = false;
  private animating = false;
  private direction: TurnDirection = 'forward';
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartProgress = 0;
  private animationStart = 0;
  private animationTarget = 0;
  private animationElapsedMs = 0;
  private animationDurationMs = 280;
  private pageChangeListener: ((leftPageIndex: number) => void) | null = null;

  public constructor() {
    this.root.rotation.x = -0.08;
    this.root.position.y = -0.04;

    this.fallbackTexture = new THREE.DataTexture(new Uint8Array([242, 234, 215, 255]), 1, 1, THREE.RGBAFormat);
    this.fallbackTexture.colorSpace = THREE.SRGBColorSpace;
    this.fallbackTexture.needsUpdate = true;

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

    this.leftPageMaterial = this.trackMaterial(this.createPageMaterial());
    const leftGeometry = this.trackGeometry(new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT));
    const leftPage = new THREE.Mesh(leftGeometry, this.leftPageMaterial);
    leftPage.position.set(-PAGE_WIDTH / 2, 0, 0.025);
    this.root.add(leftPage);

    this.rightPageMaterial = this.trackMaterial(this.createPageMaterial());
    const rightGeometry = this.trackGeometry(new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT));
    const rightPage = new THREE.Mesh(rightGeometry, this.rightPageMaterial);
    rightPage.position.set(PAGE_WIDTH / 2, 0, 0.027);
    this.root.add(rightPage);

    const gutterMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xb9aa91, transparent: true, opacity: 0.42 }));
    const gutterGeometry = this.trackGeometry(new THREE.PlaneGeometry(0.055, PAGE_HEIGHT * 0.985));
    const gutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    gutter.position.z = 0.045;
    this.root.add(gutter);

    this.turningSheet = new PageCurlSheet(PAGE_WIDTH, PAGE_HEIGHT, this.fallbackTexture, this.fallbackTexture);
    this.turningSheet.mesh.position.z = 0.055;
    this.root.add(this.turningSheet.mesh);

    this.hitRight = this.createHitSurface(PAGE_WIDTH / 2);
    this.hitLeft = this.createHitSurface(-PAGE_WIDTH / 2);
    this.root.add(this.hitRight, this.hitLeft);

    this.configureForwardVisual();
  }

  public get currentLeftPageIndex(): number { return this.spreadLeftIndex; }

  public setPageChangeListener(listener: ((leftPageIndex: number) => void) | null): void {
    this.pageChangeListener = listener;
  }

  public setPageSource(source: BookPageSource, initialPageIndex = 0): void {
    if (this.pageSource && this.pageSource !== source) this.pageSource.dispose();
    this.pageSource = source;
    this.spreadLeftIndex = Math.max(0, Math.floor(initialPageIndex / 2) * 2);
    this.progress = 0;
    this.direction = 'forward';
    this.dragging = false;
    this.animating = false;
    this.pointerWasDown = false;
    this.twist = 0;
    this.dragAmount = 0;
    this.configureForwardVisual();
    this.pageSource.warmAround(this.spreadLeftIndex);
    this.pageChangeListener?.(this.spreadLeftIndex);
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
    this.dragAmount = THREE.MathUtils.lerp(this.dragAmount, 0, Math.min(1, rawT * 0.28 + 0.08));
    this.applySheetState();

    if (rawT >= 1) this.finishAnimation();
    return this.dragging || this.animating;
  }

  public cancelInteraction(): void {
    this.pointerWasDown = false;
    this.dragging = false;
    this.animating = false;
    this.progress = 0;
    this.direction = 'forward';
    this.twist = 0;
    this.dragAmount = 0;
    this.configureForwardVisual();
    this.applySheetState();
  }

  public dispose(): void {
    this.pageSource?.dispose();
    this.pageSource = null;
    this.turningSheet.dispose();
    this.fallbackTexture.dispose();
    for (const geometry of this.staticGeometries) geometry.dispose();
    for (const material of this.staticMaterials) material.dispose();
  }

  private beginDrag(pointer: PointerSnapshot, camera: THREE.Camera): void {
    if (!this.pageSource) return;

    this.pointerNdc.set(pointer.normalizedX, pointer.normalizedY);
    this.raycaster.setFromCamera(this.pointerNdc, camera);

    const rightHit = this.raycaster.intersectObject(this.hitRight, false)[0];
    const leftHit = this.raycaster.intersectObject(this.hitLeft, false)[0];

    if (rightHit && this.canTurnForward()) {
      this.direction = 'forward';
      this.progress = 0;
      this.configureForwardVisual();
      this.grabX = rightHit.uv?.x ?? 0.9;
      this.grabY = rightHit.uv?.y ?? 0.5;
    } else if (leftHit && this.canTurnBackward()) {
      this.direction = 'backward';
      this.progress = 1;
      this.configureBackwardVisual();
      this.grabX = 1 - (leftHit.uv?.x ?? 0.1);
      this.grabY = leftHit.uv?.y ?? 0.5;
    } else {
      return;
    }

    this.animating = false;
    this.dragging = true;
    this.dragStartX = pointer.normalizedX;
    this.dragStartY = pointer.normalizedY;
    this.dragStartProgress = this.progress;
    this.twist = 0;
    this.dragAmount = 0.05;
    this.applySheetState();
  }

  private updateDrag(pointer: PointerSnapshot): void {
    const delta = (this.dragStartX - pointer.normalizedX) / DRAG_DISTANCE_NDC;
    this.progress = THREE.MathUtils.clamp(this.dragStartProgress + delta, 0, 1);

    const verticalDelta = pointer.normalizedY - this.dragStartY;
    this.twist = THREE.MathUtils.clamp(verticalDelta * 1.65, -1, 1);
    this.dragAmount = THREE.MathUtils.clamp(Math.abs(delta) * 2.2 + Math.abs(verticalDelta) * 0.55, 0, 1);
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

  private finishAnimation(): void {
    const completedForward = this.direction === 'forward' && this.animationTarget === 1;
    const completedBackward = this.direction === 'backward' && this.animationTarget === 0;

    if (completedForward) this.spreadLeftIndex = Math.min(this.spreadLeftIndex + 2, Math.max(0, this.pageCount - 1));
    if (completedBackward) this.spreadLeftIndex = Math.max(0, this.spreadLeftIndex - 2);

    this.animating = false;
    this.progress = 0;
    this.direction = 'forward';
    this.twist = 0;
    this.dragAmount = 0;
    this.configureForwardVisual();
    this.applySheetState();
    this.pageSource?.warmAround(this.spreadLeftIndex);

    if (completedForward || completedBackward) this.pageChangeListener?.(this.spreadLeftIndex);
  }

  private configureForwardVisual(): void {
    const left = this.spreadLeftIndex;
    this.setMaterialTexture(this.leftPageMaterial, left);
    this.setMaterialTexture(this.rightPageMaterial, left + 3);
    this.turningSheet.setTextures(this.textureAt(left + 1), this.textureAt(left + 2));
    this.progress = this.direction === 'backward' ? this.progress : Math.min(this.progress, 1);
    this.applySheetState();
  }

  private configureBackwardVisual(): void {
    const left = this.spreadLeftIndex;
    this.setMaterialTexture(this.leftPageMaterial, left - 2);
    this.setMaterialTexture(this.rightPageMaterial, left + 1);
    this.turningSheet.setTextures(this.textureAt(left - 1), this.textureAt(left));
    this.applySheetState();
  }

  private applySheetState(): void {
    this.turningSheet.setProgress(this.progress);
    this.turningSheet.setGrabPoint(this.grabX, this.grabY);
    this.turningSheet.setTwist(this.twist);
    this.turningSheet.setDragAmount(this.dragAmount);
  }

  private canTurnForward(): boolean {
    return this.spreadLeftIndex + 2 < this.pageCount;
  }

  private canTurnBackward(): boolean {
    return this.spreadLeftIndex >= 2;
  }

  private get pageCount(): number {
    return this.pageSource?.pageCount ?? 0;
  }

  private textureAt(index: number): THREE.Texture {
    return this.pageSource?.getTexture(index) ?? this.fallbackTexture;
  }

  private setMaterialTexture(material: THREE.MeshStandardMaterial, index: number): void {
    material.map = this.textureAt(index);
    material.needsUpdate = true;
  }

  private createPageMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: this.fallbackTexture,
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide
    });
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

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.staticGeometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.staticMaterials.push(material);
    return material;
  }
}
