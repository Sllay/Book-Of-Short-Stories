import * as THREE from 'three';
import type { PointerSnapshot } from '../core/types';
import type { BookPageSource } from './PageTextureCache';
import { PageCurlSheet } from './PageCurlSheet';

const PAGE_WIDTH = 2.3;
const PAGE_HEIGHT = 2.95;
const DRAG_DISTANCE_NDC = 1.05;
const TURN_COMMIT_PROGRESS = 0.5;
const FLICK_MIN_PROGRESS = 0.07;
const FLICK_MIN_VELOCITY = 1.15;
const RELEASE_PROJECTION_SECONDS = 0.1;
const MAX_VELOCITY_SAMPLE_MS = 160;

type TurnState = 'idle' | 'dragging' | 'settling';
export type PageTurnDirection = 'forward' | 'backward';

export interface PageTurnMotion {
  readonly direction: PageTurnDirection;
  readonly progress: number;
  readonly completion: number;
  readonly velocity: number;
  readonly deltaProgress: number;
  readonly tension: number;
  readonly active: boolean;
}

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
  private turnState: TurnState = 'idle';
  private direction: PageTurnDirection = 'forward';
  private gesturePointerId: number | null = null;
  private gestureSerial = 0;
  private settlingGestureSerial = 0;
  private committedGestureSerial = -1;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartProgress = 0;
  private lastSampleTimestamp = 0;
  private lastCompletionProgress = 0;
  private completionVelocity = 0;
  private motionIdleMs = 0;
  private animationStart = 0;
  private animationTarget = 0;
  private animationElapsedMs = 0;
  private animationDurationMs = 280;
  private reducedMotion = false;
  private pageChangeListener: ((leftPageIndex: number) => void) | null = null;
  private turnCompleteListener: ((direction: PageTurnDirection) => void) | null = null;
  private turnMotionListener: ((motion: PageTurnMotion) => void) | null = null;

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

    // Do not draw a separate center strip. The old unlit beige gutter was rendered
    // above both pages and therefore stayed bright at night, reading like a glowing
    // line. The meeting edges of the two real page surfaces already create the spine;
    // keeping only those surfaces guarantees the center follows the same lighting.

    this.turningSheet = new PageCurlSheet(PAGE_WIDTH, PAGE_HEIGHT, this.fallbackTexture, this.fallbackTexture);
    this.turningSheet.mesh.position.z = 0.055;
    this.turningSheet.mesh.visible = false;
    this.root.add(this.turningSheet.mesh);

    this.hitRight = this.createHitSurface(PAGE_WIDTH / 2);
    this.hitLeft = this.createHitSurface(-PAGE_WIDTH / 2);
    this.root.add(this.hitRight, this.hitLeft);

    this.configureIdleVisual();
  }

  public get currentLeftPageIndex(): number { return this.spreadLeftIndex; }

  public setPageChangeListener(listener: ((leftPageIndex: number) => void) | null): void {
    this.pageChangeListener = listener;
  }

  public setTurnCompleteListener(listener: ((direction: PageTurnDirection) => void) | null): void {
    this.turnCompleteListener = listener;
  }

  public setTurnMotionListener(listener: ((motion: PageTurnMotion) => void) | null): void {
    this.turnMotionListener = listener;
  }

  public setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  public setPageTurnTranslucency(enabled: boolean): void {
    this.turningSheet.setPageTranslucency(enabled);
  }

  public setPageLighting(
    ambientColor: THREE.Color,
    keyColor: THREE.Color,
    keyDirectionWorld: THREE.Vector3,
    ambientStrength: number,
    keyStrength: number
  ): void {
    this.turningSheet.setLighting(ambientColor, keyColor, keyDirectionWorld, ambientStrength, keyStrength);
  }

  public setPageSource(source: BookPageSource, initialPageIndex = 0): void {
    if (this.pageSource && this.pageSource !== source) this.pageSource.dispose();
    this.pageSource = source;
    this.spreadLeftIndex = Math.max(0, Math.floor(initialPageIndex / 2) * 2);
    this.resetInteractionState();
    this.configureIdleVisual();
    this.pageSource.warmAround(this.spreadLeftIndex);
    this.pageChangeListener?.(this.spreadLeftIndex);
  }

  public handlePointer(pointer: PointerSnapshot, camera: THREE.Camera): boolean {
    if (pointer.cancelled) {
      if (this.pointerWasDown && this.turnState === 'dragging' && pointer.id === this.gesturePointerId) this.cancelDrag();
      this.pointerWasDown = false;
      if (this.turnState !== 'dragging') this.gesturePointerId = null;
      return this.turnState !== 'idle';
    }

    if (pointer.isDown && !this.pointerWasDown) {
      if (this.turnState === 'idle') this.beginDrag(pointer, camera);
    } else if (pointer.isDown && this.turnState === 'dragging' && pointer.id === this.gesturePointerId) {
      this.updateDrag(pointer);
    } else if (!pointer.isDown && this.pointerWasDown && this.turnState === 'dragging' && pointer.id === this.gesturePointerId) {
      this.updateDrag(pointer);
      this.endDrag();
    }

    this.pointerWasDown = pointer.isDown;
    if (!pointer.isDown && this.turnState !== 'dragging') this.gesturePointerId = null;
    return this.turnState !== 'idle';
  }

  public update(deltaMs: number): boolean {
    if (this.turnState === 'dragging') {
      this.motionIdleMs += Math.max(0, deltaMs);
      if (this.motionIdleMs > 34 && Math.abs(this.completionVelocity) > 0.001) {
        const decay = Math.exp(-Math.max(0, deltaMs) / 52);
        this.completionVelocity *= decay;
        if (Math.abs(this.completionVelocity) < 0.012) this.completionVelocity = 0;
        this.emitMotion(0, true);
      }
      return true;
    }

    if (this.turnState !== 'settling') return false;

    this.animationElapsedMs += Math.max(0, deltaMs);
    const rawT = THREE.MathUtils.clamp(this.animationElapsedMs / this.animationDurationMs, 0, 1);
    const eased = 1 - Math.pow(1 - rawT, 3);
    this.progress = THREE.MathUtils.lerp(this.animationStart, this.animationTarget, eased);
    this.twist = THREE.MathUtils.lerp(this.twist, 0, Math.min(1, rawT * 0.22 + 0.08));
    this.dragAmount = THREE.MathUtils.lerp(this.dragAmount, 0, Math.min(1, rawT * 0.28 + 0.08));
    this.applySheetState();

    if (rawT >= 1) {
      this.finishAnimation();
      return false;
    }
    return true;
  }

  public cancelInteraction(): void {
    this.emitMotion(0, false);
    this.resetInteractionState();
    this.configureIdleVisual();
    this.applySheetState();
  }

  public dispose(): void {
    this.pageSource?.dispose();
    this.pageSource = null;
    this.pageChangeListener = null;
    this.turnCompleteListener = null;
    this.turnMotionListener = null;
    this.turningSheet.dispose();
    this.fallbackTexture.dispose();
    for (const geometry of this.staticGeometries) geometry.dispose();
    for (const material of this.staticMaterials) material.dispose();
  }

  private beginDrag(pointer: PointerSnapshot, camera: THREE.Camera): void {
    if (!this.pageSource || this.turnState !== 'idle') return;

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

    this.turningSheet.mesh.visible = true;
    this.turnState = 'dragging';
    this.gesturePointerId = pointer.id;
    this.gestureSerial += 1;
    this.dragStartX = pointer.normalizedX;
    this.dragStartY = pointer.normalizedY;
    this.dragStartProgress = this.progress;
    this.lastSampleTimestamp = pointer.timestamp;
    this.lastCompletionProgress = this.completionProgress();
    this.completionVelocity = 0;
    this.motionIdleMs = 0;
    this.twist = 0;
    this.dragAmount = this.reducedMotion ? 0 : 0.05;
    this.applySheetState();
    this.emitMotion(0, true);
  }

  private updateDrag(pointer: PointerSnapshot): void {
    if (this.turnState !== 'dragging' || pointer.id !== this.gesturePointerId) return;

    const previousCompletion = this.lastCompletionProgress;
    const delta = (this.dragStartX - pointer.normalizedX) / DRAG_DISTANCE_NDC;
    this.progress = THREE.MathUtils.clamp(this.dragStartProgress + delta, 0, 1);

    const verticalDelta = pointer.normalizedY - this.dragStartY;
    this.twist = this.reducedMotion ? 0 : THREE.MathUtils.clamp(verticalDelta * 1.65, -1, 1);
    this.dragAmount = this.reducedMotion
      ? 0
      : THREE.MathUtils.clamp(Math.abs(delta) * 2.2 + Math.abs(verticalDelta) * 0.55, 0, 1);
    this.applySheetState();

    const completion = this.completionProgress();
    const elapsedMs = pointer.timestamp - this.lastSampleTimestamp;
    if (elapsedMs > 0 && elapsedMs <= MAX_VELOCITY_SAMPLE_MS) {
      const instantVelocity = THREE.MathUtils.clamp((completion - previousCompletion) / (elapsedMs / 1000), -10, 10);
      this.completionVelocity = THREE.MathUtils.lerp(this.completionVelocity, instantVelocity, 0.66);
    } else if (elapsedMs > MAX_VELOCITY_SAMPLE_MS) {
      this.completionVelocity = 0;
    }

    const deltaProgress = completion - previousCompletion;
    this.lastCompletionProgress = completion;
    this.lastSampleTimestamp = pointer.timestamp;
    this.motionIdleMs = 0;
    this.emitMotion(deltaProgress, true);
  }

  private endDrag(): void {
    if (this.turnState !== 'dragging') return;

    const completion = this.completionProgress();
    const forwardVelocity = Math.max(0, this.completionVelocity);
    const projectedCompletion = completion + forwardVelocity * RELEASE_PROJECTION_SECONDS;
    const fastFlick = completion >= FLICK_MIN_PROGRESS && forwardVelocity >= FLICK_MIN_VELOCITY;
    const projectedCommit = completion >= 0.18 && projectedCompletion >= TURN_COMMIT_PROGRESS;
    const completeTurn = completion >= TURN_COMMIT_PROGRESS || fastFlick || projectedCommit;

    this.beginSettle(completeTurn, forwardVelocity);
  }

  private cancelDrag(): void {
    if (this.turnState !== 'dragging') return;
    this.completionVelocity = 0;
    this.beginSettle(false, 0);
  }

  private beginSettle(completeTurn: boolean, forwardVelocity: number): void {
    this.turnState = 'settling';
    this.settlingGestureSerial = this.gestureSerial;
    this.animationStart = this.progress;
    this.animationTarget = this.direction === 'forward'
      ? (completeTurn ? 1 : 0)
      : (completeTurn ? 0 : 1);
    this.animationElapsedMs = 0;

    const remaining = Math.abs(this.animationTarget - this.animationStart);
    const speedBonusMs = THREE.MathUtils.clamp(forwardVelocity * 30, 0, 105);
    const normalDuration = 145 + remaining * 230 - speedBonusMs;
    const reducedDuration = 72 + remaining * 72;
    this.animationDurationMs = Math.max(this.reducedMotion ? 68 : 105, this.reducedMotion ? reducedDuration : normalDuration);

    this.emitMotion(0, false);
  }

  private finishAnimation(): void {
    if (this.turnState !== 'settling') return;

    const completedDirection = this.direction;
    const completedForward = completedDirection === 'forward' && this.animationTarget === 1;
    const completedBackward = completedDirection === 'backward' && this.animationTarget === 0;
    const canCommit = this.committedGestureSerial !== this.settlingGestureSerial;

    if (canCommit && completedForward) {
      this.spreadLeftIndex = Math.min(this.spreadLeftIndex + 2, Math.max(0, this.pageCount - 1));
      this.committedGestureSerial = this.settlingGestureSerial;
    } else if (canCommit && completedBackward) {
      this.spreadLeftIndex = Math.max(0, this.spreadLeftIndex - 2);
      this.committedGestureSerial = this.settlingGestureSerial;
    }

    this.turnState = 'idle';
    this.progress = 0;
    this.direction = 'forward';
    this.twist = 0;
    this.dragAmount = 0;
    this.completionVelocity = 0;
    this.motionIdleMs = 0;
    this.gesturePointerId = null;
    this.configureIdleVisual();
    this.applySheetState();
    this.pageSource?.warmAround(this.spreadLeftIndex);

    if (canCommit && (completedForward || completedBackward)) {
      this.pageChangeListener?.(this.spreadLeftIndex);
      this.turnCompleteListener?.(completedDirection);
    }
  }

  private completionProgress(): number {
    return this.direction === 'forward' ? this.progress : 1 - this.progress;
  }

  private emitMotion(deltaProgress: number, active: boolean): void {
    this.turnMotionListener?.({
      direction: this.direction,
      progress: this.progress,
      completion: this.completionProgress(),
      velocity: this.completionVelocity,
      deltaProgress,
      tension: this.dragAmount,
      active
    });
  }

  private resetInteractionState(): void {
    this.pointerWasDown = false;
    this.turnState = 'idle';
    this.gesturePointerId = null;
    this.progress = 0;
    this.direction = 'forward';
    this.twist = 0;
    this.dragAmount = 0;
    this.completionVelocity = 0;
    this.motionIdleMs = 0;
    this.animationElapsedMs = 0;
  }

  private configureIdleVisual(): void {
    const left = this.spreadLeftIndex;
    this.setMaterialTexture(this.leftPageMaterial, left);
    this.setMaterialTexture(this.rightPageMaterial, left + 1);
    this.turningSheet.setTextures(this.textureAt(left + 1), this.textureAt(left + 2));
    this.turningSheet.mesh.visible = false;
    this.progress = 0;
    this.applySheetState();
  }

  private configureForwardVisual(): void {
    const left = this.spreadLeftIndex;
    this.setMaterialTexture(this.leftPageMaterial, left);
    this.setMaterialTexture(this.rightPageMaterial, left + 3);
    this.turningSheet.setTextures(this.textureAt(left + 1), this.textureAt(left + 2));
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
