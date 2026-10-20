import * as THREE from 'three';
import type { PointerSnapshot } from '../core/types';
import type { BookRenderer, PhysicalFoldSide } from './BookRenderer';

const CLOSED_WIDTH = 2.52;
const CLOSED_HEIGHT = 3.17;
const BOOK_PAGE_WIDTH = 2.3;
const BOOK_PAGE_HEIGHT = 2.95;
const CLOSED_HOME_X = BOOK_PAGE_WIDTH * 0.5;
const BOOKMARK_X = 2.02;
const BOOKMARK_Y = BOOK_PAGE_HEIGHT * 0.5 + 0.18;
const BOOKMARK_Z = 0.13;
const BOOKMARK_TRANSITION_MS = 300;
const CLOSE_DURATION_MS = 980;
const OPEN_DURATION_MS = 980;
const FINISHED_FLIP_DURATION_MS = 1320;

export type BookCloseReason = 'manual' | 'finished' | 'import';

export interface BookCoverArtwork {
  readonly texture: THREE.Texture | null;
  readonly edgeColor: number;
}

type PresentationPhase = 'open' | 'closing' | 'closed' | 'opening' | 'finished-flip';
type BookmarkSide = 'left' | 'right';

interface EndGesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
}

export class BookPresentationController {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly closedGroup = new THREE.Group();
  private readonly closedBodyMaterial: THREE.MeshStandardMaterial;
  private readonly closedCoverMaterial: THREE.MeshStandardMaterial;
  private readonly closedBackMaterial: THREE.MeshStandardMaterial;
  private readonly closedSpineMaterial: THREE.MeshStandardMaterial;
  private readonly closedHit: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly endHit: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly bookmarkMaterial: THREE.MeshStandardMaterial;
  private readonly bookmarkTab: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  private coverTexture: THREE.Texture | null = null;
  private phase: PresentationPhase = 'open';
  private closeReason: BookCloseReason = 'manual';
  private closingSide: PhysicalFoldSide = 'left';
  private animationElapsedMs = 0;
  private pointerWasDown = false;
  private endGesture: EndGesture | null = null;
  private bookmarkPage: number | null = null;
  private currentLeftPage = 0;
  private bookmarkSide: BookmarkSide | null = null;
  private bookmarkTargetSide: BookmarkSide | null = null;
  private bookmarkTransitionElapsedMs = 0;
  private bookmarkTransitionActive = false;
  private openRequestListener: ((reason: BookCloseReason) => void) | null = null;
  private finishRequestListener: (() => void) | null = null;
  private bookmarkRequestListener: ((pageIndex: number) => void) | null = null;

  public constructor(private readonly book: BookRenderer) {
    this.root.add(book.root);

    this.closedBodyMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5a3526,
      roughness: 0.88,
      metalness: 0,
      transparent: true
    }));
    const body = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(CLOSED_WIDTH, CLOSED_HEIGHT, 0.24)),
      this.closedBodyMaterial
    );
    this.closedGroup.add(body);

    this.closedCoverMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5a3526,
      roughness: 0.82,
      metalness: 0,
      transparent: true,
      side: THREE.FrontSide
    }));
    const front = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(CLOSED_WIDTH - 0.12, CLOSED_HEIGHT - 0.12)),
      this.closedCoverMaterial
    );
    front.position.z = 0.126;
    this.closedGroup.add(front);

    this.closedBackMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5a3526,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      side: THREE.FrontSide
    }));
    const back = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(CLOSED_WIDTH - 0.12, CLOSED_HEIGHT - 0.12)),
      this.closedBackMaterial
    );
    back.position.z = -0.126;
    back.rotation.y = Math.PI;
    this.closedGroup.add(back);

    this.closedSpineMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x43271e,
      roughness: 0.9,
      metalness: 0,
      transparent: true
    }));
    const spine = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(0.105, CLOSED_HEIGHT + 0.02, 0.285)),
      this.closedSpineMaterial
    );
    spine.position.x = -CLOSED_WIDTH * 0.5 + 0.035;
    this.closedGroup.add(spine);

    this.closedHit = this.createInvisibleHit(CLOSED_WIDTH, CLOSED_HEIGHT);
    this.closedHit.position.z = 0.19;
    this.closedGroup.add(this.closedHit);

    this.closedGroup.position.set(CLOSED_HOME_X, -0.04, 0.02);
    this.closedGroup.rotation.x = -0.08;
    this.closedGroup.visible = false;
    this.root.add(this.closedGroup);

    this.bookmarkMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xb4483c,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      depthWrite: false
    }));
    this.bookmarkTab = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(0.27, 0.58)),
      this.bookmarkMaterial
    );
    this.applyBookmarkSide('right');
    this.bookmarkTab.visible = false;
    this.book.root.add(this.bookmarkTab);

    this.endHit = this.createInvisibleHit(BOOK_PAGE_WIDTH, BOOK_PAGE_HEIGHT);
    this.endHit.position.set(BOOK_PAGE_WIDTH * 0.5, 0, 0.18);
    this.book.root.add(this.endHit);
  }

  public get isClosed(): boolean {
    return this.phase === 'closed' || this.phase === 'finished-flip';
  }

  public get isAnimating(): boolean {
    return this.phase === 'closing' || this.phase === 'opening' || this.phase === 'finished-flip';
  }

  public get reason(): BookCloseReason { return this.closeReason; }

  public setOpenRequestListener(listener: ((reason: BookCloseReason) => void) | null): void {
    this.openRequestListener = listener;
  }

  public setFinishRequestListener(listener: (() => void) | null): void {
    this.finishRequestListener = listener;
  }

  public setBookmarkRequestListener(listener: ((pageIndex: number) => void) | null): void {
    this.bookmarkRequestListener = listener;
  }

  public setCoverArtwork(artwork: BookCoverArtwork | null): void {
    if (this.coverTexture && this.coverTexture !== artwork?.texture) this.coverTexture.dispose();
    this.coverTexture = artwork?.texture ?? null;
    const edgeColor = artwork?.edgeColor ?? 0x5a3526;
    this.closedBodyMaterial.color.setHex(edgeColor);
    this.closedBackMaterial.color.setHex(edgeColor);
    this.closedCoverMaterial.map = this.coverTexture;
    this.closedCoverMaterial.color.setHex(this.coverTexture ? 0xffffff : edgeColor);
    this.closedCoverMaterial.needsUpdate = true;
    this.closedBackMaterial.needsUpdate = true;
    this.closedSpineMaterial.color.set(new THREE.Color(edgeColor).multiplyScalar(0.78));
  }

  public setCurrentPage(leftPageIndex: number): void {
    this.currentLeftPage = Math.max(0, Math.floor(leftPageIndex / 2) * 2);
    this.syncBookmarkPosition(true);
  }

  public setBookmark(pageIndex: number | null, color: string): void {
    this.bookmarkPage = pageIndex === null ? null : Math.max(0, Math.floor(pageIndex));
    this.bookmarkMaterial.color.set(color);

    if (this.bookmarkPage === null) {
      this.bookmarkTab.visible = false;
      this.bookmarkSide = null;
      this.bookmarkTargetSide = null;
      this.bookmarkTransitionActive = false;
      this.bookmarkTransitionElapsedMs = 0;
      this.bookmarkMaterial.opacity = 1;
      return;
    }

    this.bookmarkTab.visible = this.phase === 'open';
    this.syncBookmarkPosition(this.bookmarkSide !== null);
  }

  public close(reason: BookCloseReason, instant = false): void {
    this.closeReason = reason;
    this.closingSide = reason === 'finished' ? 'right' : 'left';
    this.endGesture = null;
    this.pointerWasDown = false;
    this.bookmarkTab.visible = false;
    this.bookmarkTransitionActive = false;
    this.bookmarkTransitionElapsedMs = 0;
    this.bookmarkMaterial.opacity = 1;

    if (instant) {
      this.phase = 'closed';
      this.book.root.visible = false;
      this.book.resetPhysicalFold();
      this.closedGroup.visible = true;
      this.resetClosedPose(CLOSED_HOME_X, 0);
      this.setClosedOpacity(1);
      return;
    }

    if (this.phase !== 'open') return;
    this.phase = 'closing';
    this.animationElapsedMs = 0;
    this.book.cancelInteraction();
    this.book.resetPhysicalFold();
    this.book.root.visible = true;
    this.closedGroup.visible = true;
    this.resetClosedPose(this.closingSide === 'left' ? CLOSED_HOME_X : -CLOSED_HOME_X, this.closingSide === 'right' ? Math.PI : 0);
    this.setClosedOpacity(0);
  }

  public open(): void {
    if (this.phase !== 'closed') return;
    this.phase = 'opening';
    this.animationElapsedMs = 0;
    this.closedGroup.visible = true;
    this.resetClosedPose(CLOSED_HOME_X, 0);
    this.book.root.visible = true;
    this.book.setPhysicalFold('left', 1);
    this.bookmarkTab.visible = false;
    this.bookmarkTransitionActive = false;
    this.bookmarkMaterial.opacity = 1;
    this.setClosedOpacity(1);
  }

  public handlePointer(pointer: PointerSnapshot, camera: THREE.Camera, atEnd: boolean): boolean {
    if (pointer.cancelled) {
      this.pointerWasDown = false;
      this.endGesture = null;
      return this.isAnimating;
    }

    if (this.isAnimating) {
      this.pointerWasDown = pointer.isDown;
      return true;
    }

    if (this.phase === 'closed') {
      if (pointer.isDown && !this.pointerWasDown && this.hit(pointer, camera, this.closedHit)) {
        this.openRequestListener?.(this.closeReason);
      }
      this.pointerWasDown = pointer.isDown;
      return pointer.isDown;
    }

    if (pointer.isDown && !this.pointerWasDown) {
      if (
        this.bookmarkPage !== null
        && this.bookmarkTab.visible
        && this.bookmarkMaterial.opacity > 0.3
        && this.hit(pointer, camera, this.bookmarkTab)
      ) {
        this.bookmarkRequestListener?.(this.bookmarkPage);
        this.pointerWasDown = true;
        return true;
      }

      if (atEnd && this.hit(pointer, camera, this.endHit)) {
        this.endGesture = {
          pointerId: pointer.id,
          startX: pointer.normalizedX,
          startY: pointer.normalizedY
        };
        this.pointerWasDown = true;
        return true;
      }
    } else if (pointer.isDown && this.endGesture?.pointerId === pointer.id) {
      const dx = this.endGesture.startX - pointer.normalizedX;
      const dy = pointer.normalizedY - this.endGesture.startY;
      if (dx > 0.035 || Math.hypot(dx, dy) > 0.065) {
        this.endGesture = null;
        this.finishRequestListener?.();
      }
      this.pointerWasDown = true;
      return true;
    } else if (!pointer.isDown && this.endGesture?.pointerId === pointer.id) {
      this.endGesture = null;
    }

    this.pointerWasDown = pointer.isDown;
    return false;
  }

  public update(deltaMs: number): boolean {
    const delta = Math.max(0, Math.min(100, deltaMs));

    if (this.phase === 'closing') {
      this.animationElapsedMs += delta;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / CLOSE_DURATION_MS, 0, 1);
      const foldWindow = smoothWindow(t, 0, 0.93);
      const foldProgress = easeInOutQuint(foldWindow);
      this.book.setPhysicalFold(this.closingSide, foldProgress);

      // Swap representations only after the physical halves are almost fully together.
      // This avoids the old ghosted closed book floating over a still-open spread.
      const closedReveal = smoothWindow(t, 0.9, 1);
      this.setClosedOpacity(closedReveal);

      if (t >= 1) {
        this.book.root.visible = false;
        this.book.resetPhysicalFold();
        this.setClosedOpacity(1);
        if (this.closeReason === 'finished') {
          this.phase = 'finished-flip';
          this.animationElapsedMs = 0;
          this.resetClosedPose(-CLOSED_HOME_X, Math.PI);
        } else {
          this.phase = 'closed';
          this.resetClosedPose(CLOSED_HOME_X, 0);
        }
      }
      return true;
    }

    if (this.phase === 'finished-flip') {
      this.animationElapsedMs += delta;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / FINISHED_FLIP_DURATION_MS, 0, 1);

      // Hold the back cover for a beat, then roll the whole closed book over with a
      // soft lift. The lateral move is eased rather than linear so it reads as weight,
      // not a UI card translating across the table.
      const flipWindow = smoothWindow(t, 0.12, 0.86);
      const flip = easeInOutQuint(flipWindow);
      const lift = Math.sin(Math.PI * flip);
      this.closedGroup.rotation.y = Math.PI + Math.PI * flip;
      this.closedGroup.rotation.x = -0.08 + lift * 0.052;
      this.closedGroup.rotation.z = -lift * 0.022;
      this.closedGroup.position.x = THREE.MathUtils.lerp(-CLOSED_HOME_X, CLOSED_HOME_X, flip);
      this.closedGroup.position.y = -0.04 + lift * 0.04;
      this.closedGroup.position.z = 0.02 + lift * 0.24;

      const settle = smoothWindow(t, 0.86, 1);
      if (settle > 0) {
        const damped = Math.sin(settle * Math.PI * 2) * (1 - settle);
        this.closedGroup.position.z += damped * 0.018;
        this.closedGroup.rotation.x += damped * 0.012;
      }

      if (t >= 1) {
        this.resetClosedPose(CLOSED_HOME_X, 0);
        this.phase = 'closed';
      }
      return true;
    }

    if (this.phase === 'opening') {
      this.animationElapsedMs += delta;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / OPEN_DURATION_MS, 0, 1);

      // First transfer from the closed mesh to the physically folded book, then let the
      // hardcover lead the opening while the paper block follows through its own hinge.
      const transfer = smoothWindow(t, 0, 0.18);
      this.setClosedOpacity(1 - transfer);
      const unfoldWindow = smoothWindow(t, 0.08, 1);
      const unfold = easeInOutQuint(unfoldWindow);
      this.book.setPhysicalFold('left', 1 - unfold);

      if (t >= 1) {
        this.phase = 'open';
        this.closedGroup.visible = false;
        this.setClosedOpacity(1);
        this.book.resetPhysicalFold();
        this.book.root.visible = true;
        this.bookmarkTab.visible = this.bookmarkPage !== null;
        this.syncBookmarkPosition(false);
      }
      return true;
    }

    return this.updateBookmarkTransition(delta);
  }

  public dispose(): void {
    if (this.coverTexture) this.coverTexture.dispose();
    this.coverTexture = null;
    this.openRequestListener = null;
    this.finishRequestListener = null;
    this.bookmarkRequestListener = null;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private desiredBookmarkSide(): BookmarkSide | null {
    if (this.bookmarkPage === null) return null;
    const targetLeft = Math.floor(this.bookmarkPage / 2) * 2;
    if (targetLeft < this.currentLeftPage) return 'left';
    if (targetLeft > this.currentLeftPage) return 'right';
    return this.bookmarkPage % 2 === 0 ? 'left' : 'right';
  }

  private syncBookmarkPosition(animate: boolean): void {
    const desired = this.desiredBookmarkSide();
    if (!desired) {
      this.bookmarkTab.visible = false;
      this.bookmarkSide = null;
      this.bookmarkTargetSide = null;
      this.bookmarkTransitionActive = false;
      this.bookmarkMaterial.opacity = 1;
      return;
    }

    if (this.bookmarkSide === null || !animate || this.phase !== 'open') {
      this.bookmarkSide = desired;
      this.bookmarkTargetSide = desired;
      this.bookmarkTransitionActive = false;
      this.bookmarkTransitionElapsedMs = 0;
      this.bookmarkMaterial.opacity = 1;
      this.applyBookmarkSide(desired);
      this.bookmarkTab.visible = this.phase === 'open';
      return;
    }

    if (desired === this.bookmarkSide) {
      this.bookmarkTargetSide = desired;
      this.bookmarkTransitionActive = false;
      this.bookmarkTransitionElapsedMs = 0;
      this.bookmarkMaterial.opacity = 1;
      this.applyBookmarkSide(desired);
      this.bookmarkTab.visible = this.phase === 'open';
      return;
    }

    if (this.bookmarkTransitionActive && desired === this.bookmarkTargetSide) return;

    this.bookmarkTargetSide = desired;
    this.bookmarkTransitionElapsedMs = 0;
    this.bookmarkTransitionActive = true;
    this.bookmarkMaterial.opacity = 1;
    this.bookmarkTab.visible = this.phase === 'open';
  }

  private updateBookmarkTransition(deltaMs: number): boolean {
    if (!this.bookmarkTransitionActive || this.phase !== 'open' || this.bookmarkPage === null) return false;

    this.bookmarkTransitionElapsedMs += deltaMs;
    const t = THREE.MathUtils.clamp(this.bookmarkTransitionElapsedMs / BOOKMARK_TRANSITION_MS, 0, 1);

    if (t < 0.5) {
      this.bookmarkMaterial.opacity = 1 - THREE.MathUtils.smoothstep(t / 0.5, 0, 1);
    } else {
      if (this.bookmarkTargetSide && this.bookmarkSide !== this.bookmarkTargetSide) {
        this.bookmarkSide = this.bookmarkTargetSide;
        this.applyBookmarkSide(this.bookmarkSide);
      }
      this.bookmarkMaterial.opacity = THREE.MathUtils.smoothstep((t - 0.5) / 0.5, 0, 1);
    }

    if (t >= 1) {
      this.bookmarkTransitionActive = false;
      this.bookmarkTransitionElapsedMs = 0;
      this.bookmarkMaterial.opacity = 1;
      return false;
    }
    return true;
  }

  private applyBookmarkSide(side: BookmarkSide): void {
    this.bookmarkTab.position.set(side === 'left' ? -BOOKMARK_X : BOOKMARK_X, BOOKMARK_Y, BOOKMARK_Z);
    this.bookmarkTab.rotation.z = side === 'left' ? -0.025 : 0.025;
  }

  private hit(pointer: PointerSnapshot, camera: THREE.Camera, object: THREE.Object3D): boolean {
    this.pointerNdc.set(pointer.normalizedX, pointer.normalizedY);
    this.raycaster.setFromCamera(this.pointerNdc, camera);
    return this.raycaster.intersectObject(object, false).length > 0;
  }

  private createInvisibleHit(width: number, height: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const material = this.trackMaterial(new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    material.colorWrite = false;
    const mesh = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(width, height)), material);
    mesh.renderOrder = -2;
    return mesh;
  }

  private setClosedOpacity(value: number): void {
    const opacity = THREE.MathUtils.clamp(value, 0, 1);
    this.closedBodyMaterial.opacity = opacity;
    this.closedCoverMaterial.opacity = opacity;
    this.closedBackMaterial.opacity = opacity;
    this.closedSpineMaterial.opacity = opacity;
  }

  private resetClosedPose(x: number, rotationY: number): void {
    this.closedGroup.position.set(x, -0.04, 0.02);
    this.closedGroup.rotation.set(-0.08, rotationY, 0);
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}

function smoothWindow(value: number, start: number, end: number): number {
  if (end <= start) return value >= end ? 1 : 0;
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInOutQuint(t: number): number {
  return t < 0.5
    ? 16 * t * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
