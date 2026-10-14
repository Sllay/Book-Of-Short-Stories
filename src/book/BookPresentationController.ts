import * as THREE from 'three';
import type { PointerSnapshot } from '../core/types';
import type { BookRenderer, PhysicalFoldSide } from './BookRenderer';

const CLOSED_WIDTH = 2.52;
const CLOSED_HEIGHT = 3.17;
const BOOK_PAGE_WIDTH = 2.3;
const BOOK_PAGE_HEIGHT = 2.95;
const CLOSED_HOME_X = BOOK_PAGE_WIDTH * 0.5;

export type BookCloseReason = 'manual' | 'finished' | 'import';

export interface BookCoverArtwork {
  readonly texture: THREE.Texture | null;
  readonly edgeColor: number;
}

type PresentationPhase = 'open' | 'closing' | 'closed' | 'opening' | 'finished-flip';

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
      side: THREE.DoubleSide
    }));
    this.bookmarkTab = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(0.27, 0.58)),
      this.bookmarkMaterial
    );
    this.bookmarkTab.position.set(1.82, BOOK_PAGE_HEIGHT * 0.5 + 0.12, 0.16);
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
    this.positionBookmark();
  }

  public setBookmark(pageIndex: number | null, color: string): void {
    this.bookmarkPage = pageIndex === null ? null : Math.max(0, Math.floor(pageIndex));
    this.bookmarkMaterial.color.set(color);
    this.bookmarkTab.visible = this.bookmarkPage !== null && this.phase === 'open';
    this.positionBookmark();
  }

  public close(reason: BookCloseReason, instant = false): void {
    this.closeReason = reason;
    this.closingSide = reason === 'finished' ? 'right' : 'left';
    this.endGesture = null;
    this.pointerWasDown = false;
    this.bookmarkTab.visible = false;

    if (instant) {
      this.phase = 'closed';
      this.book.root.visible = false;
      this.book.resetPhysicalFold();
      this.closedGroup.visible = true;
      this.closedGroup.position.set(CLOSED_HOME_X, -0.04, 0.02);
      this.closedGroup.rotation.y = 0;
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
    this.closedGroup.position.set(this.closingSide === 'left' ? CLOSED_HOME_X : -CLOSED_HOME_X, -0.04, 0.02);
    this.closedGroup.rotation.y = this.closingSide === 'right' ? Math.PI : 0;
    this.setClosedOpacity(0);
  }

  public open(): void {
    if (this.phase !== 'closed') return;
    this.phase = 'opening';
    this.animationElapsedMs = 0;
    this.closedGroup.visible = true;
    this.closedGroup.position.set(CLOSED_HOME_X, -0.04, 0.02);
    this.closedGroup.rotation.y = 0;
    this.book.root.visible = true;
    this.book.setPhysicalFold('left', 1);
    this.bookmarkTab.visible = false;
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
      if (this.bookmarkPage !== null && this.bookmarkTab.visible && this.hit(pointer, camera, this.bookmarkTab)) {
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
      const duration = 760;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / duration, 0, 1);
      const eased = easeInOutCubic(t);
      this.book.setPhysicalFold(this.closingSide, eased);
      const closedReveal = THREE.MathUtils.smoothstep((t - 0.78) / 0.22, 0, 1);
      this.setClosedOpacity(closedReveal);

      if (t >= 1) {
        this.book.root.visible = false;
        this.book.resetPhysicalFold();
        this.setClosedOpacity(1);
        if (this.closeReason === 'finished') {
          this.phase = 'finished-flip';
          this.animationElapsedMs = 0;
          this.closedGroup.position.set(-CLOSED_HOME_X, -0.04, 0.02);
          this.closedGroup.rotation.y = Math.PI;
        } else {
          this.phase = 'closed';
          this.closedGroup.position.set(CLOSED_HOME_X, -0.04, 0.02);
          this.closedGroup.rotation.y = 0;
        }
      }
      return true;
    }

    if (this.phase === 'finished-flip') {
      this.animationElapsedMs += delta;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / 1080, 0, 1);
      const eased = easeInOutCubic(t);
      this.closedGroup.rotation.y = THREE.MathUtils.lerp(Math.PI, Math.PI * 2, eased);
      this.closedGroup.position.x = THREE.MathUtils.lerp(-CLOSED_HOME_X, CLOSED_HOME_X, eased);
      this.closedGroup.position.z = 0.02 + Math.sin(Math.PI * t) * 0.13;
      if (t >= 1) {
        this.closedGroup.rotation.y = 0;
        this.closedGroup.position.set(CLOSED_HOME_X, -0.04, 0.02);
        this.phase = 'closed';
      }
      return true;
    }

    if (this.phase === 'opening') {
      this.animationElapsedMs += delta;
      const t = THREE.MathUtils.clamp(this.animationElapsedMs / 720, 0, 1);
      const eased = easeInOutCubic(t);
      this.book.setPhysicalFold('left', 1 - eased);
      this.setClosedOpacity(1 - THREE.MathUtils.smoothstep((t - 0.08) / 0.38, 0, 1));

      if (t >= 1) {
        this.phase = 'open';
        this.closedGroup.visible = false;
        this.setClosedOpacity(1);
        this.book.resetPhysicalFold();
        this.book.root.visible = true;
        this.bookmarkTab.visible = this.bookmarkPage !== null;
        this.positionBookmark();
      }
      return true;
    }

    return false;
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

  private positionBookmark(): void {
    if (this.bookmarkPage === null) return;
    const targetLeft = Math.floor(this.bookmarkPage / 2) * 2;
    const delta = targetLeft - this.currentLeftPage;

    if (delta < 0) {
      this.bookmarkTab.position.set(-2.02, BOOK_PAGE_HEIGHT * 0.5 + 0.18, 0.13);
      this.bookmarkTab.rotation.z = -0.025;
    } else if (delta > 0) {
      this.bookmarkTab.position.set(2.02, BOOK_PAGE_HEIGHT * 0.5 + 0.18, 0.13);
      this.bookmarkTab.rotation.z = 0.025;
    } else {
      const onLeftPage = this.bookmarkPage % 2 === 0;
      this.bookmarkTab.position.set(onLeftPage ? -1.72 : 1.72, BOOK_PAGE_HEIGHT * 0.5 + 0.06, 0.15);
      this.bookmarkTab.rotation.z = onLeftPage ? -0.015 : 0.015;
    }
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

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
