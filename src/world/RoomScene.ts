import * as THREE from 'three';
import { createFloorTexture, createWallTexture, createWoodTexture } from './WorldMaterialTextures';

/**
 * All dimensions are world units. Z is up, X is left/right and Y is room depth.
 * The camera looks down from +Z, so a roof and the upper front wall are cut away.
 * This is a REAL 3D cabin, not a perspective-painted floor or a wall-sized decal.
 */
export const CABIN_LAYOUT = {
  halfWidth: 6.55,
  halfDepth: 4.7,
  floorZ: -1.60,
  wallTopZ: 2.42,
  wallThickness: 0.18,
  tableTopZ: -0.20,
  window: { x: 2.45, y: 4.7, z: 0.87, width: 2.72, height: 1.78 },
  door: { y: 1.54, width: 1.78, topZ: 1.32 }
} as const;

const WALL_NEUTRAL = new THREE.Color(0x8d756a);

export class RoomScene {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly deskMaterial: THREE.MeshStandardMaterial;
  private readonly edgeMaterial: THREE.MeshStandardMaterial;
  private readonly floorMaterial: THREE.MeshStandardMaterial;
  private readonly wallMaterial: THREE.MeshStandardMaterial;

  public constructor() {
    const wood = this.trackTexture(createWoodTexture());
    const floorTexture = this.trackTexture(createFloorTexture());
    const wallTexture = this.trackTexture(createWallTexture());

    this.deskMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: wood, color: 0xc8a17a, roughness: 0.83, metalness: 0,
      emissive: 0x392115, emissiveIntensity: 0.025
    }));
    this.edgeMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: wood, color: 0x78523c, roughness: 0.88, metalness: 0,
      emissive: 0x2b1a12, emissiveIntensity: 0.03
    }));
    this.floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: floorTexture, color: 0xe0bf98, roughness: 0.95, metalness: 0,
      emissive: 0x5a4028, emissiveIntensity: 0.035
    }));
    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: wallTexture, color: 0x806a61, roughness: 0.98, metalness: 0,
      emissive: 0x382c29, emissiveIntensity: 0.045
    }));
    const timber = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x513526, roughness: 0.9, metalness: 0,
      emissive: 0x21140e, emissiveIntensity: 0.04
    }));

    this.createCabin(timber);
    this.createTable(timber);
    this.createSignature();
  }

  public setWallColor(hex: number): void {
    const coherent = new THREE.Color(hex).lerp(WALL_NEUTRAL, 0.42);
    this.wallMaterial.color.copy(coherent);
    this.wallMaterial.emissive.copy(coherent).multiplyScalar(0.34);
  }

  public setAmbientReadability(hemisphereIntensity: number): void {
    const normalized = THREE.MathUtils.clamp((hemisphereIntensity - 0.62) / 0.82, 0, 1);
    const night = 1 - normalized;
    this.wallMaterial.emissiveIntensity = 0.045 + night * 0.12;
    this.floorMaterial.emissiveIntensity = 0.035 + night * 0.10;
    this.deskMaterial.emissiveIntensity = 0.022 + night * 0.08;
    this.edgeMaterial.emissiveIntensity = 0.026 + night * 0.07;
  }

  public dispose(): void {
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createCabin(timber: THREE.Material): void {
    const c = CABIN_LAYOUT;
    const width = c.halfWidth * 2;
    const depth = c.halfDepth * 2;
    const height = c.wallTopZ - c.floorZ;
    const floor = this.box(width + 0.12, depth + 0.12, 0.16, this.floorMaterial);
    floor.position.z = c.floorZ - 0.08;

    // Four actual, mutually perpendicular walls. The front is a cutaway parapet
    // so it never obscures text when the camera moves towards the reader.
    const rearY = c.halfDepth;
    const rearLeft = -c.halfWidth;
    const rearRight = c.halfWidth;
    const winLeft = c.window.x - c.window.width / 2;
    const winRight = c.window.x + c.window.width / 2;
    const winBottom = c.window.z - c.window.height / 2;
    const winTop = c.window.z + c.window.height / 2;

    this.rearPanel(rearLeft, winLeft, c.floorZ, c.wallTopZ);
    this.rearPanel(winRight, rearRight, c.floorZ, c.wallTopZ);
    this.rearPanel(winLeft, winRight, c.floorZ, winBottom);
    this.rearPanel(winLeft, winRight, winTop, c.wallTopZ);

    this.box(0.18, depth, height, this.wallMaterial)
      .position.set(-c.halfWidth, 0, (c.floorZ + c.wallTopZ) / 2);

    const doorMin = c.door.y - c.door.width / 2;
    const doorMax = c.door.y + c.door.width / 2;
    this.sidePanel(-c.halfDepth, doorMin, c.floorZ, c.wallTopZ);
    this.sidePanel(doorMax, c.halfDepth, c.floorZ, c.wallTopZ);
    this.sidePanel(doorMin, doorMax, c.door.topZ, c.wallTopZ);

    // A fourth wall is represented by a low real 3D section; upper part is
    // intentionally removed like an architectural dollhouse cutaway.
    const frontHeight = 0.83;
    this.box(width, 0.18, frontHeight, this.wallMaterial)
      .position.set(0, -c.halfDepth, c.floorZ + frontHeight / 2);
    this.box(width + 0.14, 0.25, 0.13, timber)
      .position.set(0, -c.halfDepth, c.floorZ + frontHeight + 0.025);

    // Four corner posts, a continuous rear beam and a real skirting board.
    const postGeometry = this.trackGeometry(new THREE.BoxGeometry(0.25, 0.25, height));
    for (const x of [-c.halfWidth, c.halfWidth]) {
      for (const y of [-c.halfDepth, c.halfDepth]) {
        const post = new THREE.Mesh(postGeometry, timber);
        post.position.set(x, y, c.floorZ + height / 2);
        this.root.add(post);
      }
    }
    this.box(width + 0.18, 0.25, 0.19, timber)
      .position.set(0, rearY - 0.04, c.wallTopZ - 0.02);
    this.box(width - 0.18, 0.11, 0.15, timber)
      .position.set(0, rearY - 0.12, c.floorZ + 0.12);
    this.box(0.13, depth - 0.15, 0.16, timber)
      .position.set(-c.halfWidth + 0.12, 0, c.floorZ + 0.12);

    // Window is a genuine rectangular hole; sky texture and 3D sash are
    // installed separately by ReadingWorldController into this opening.
    this.box(c.window.width + 0.34, 0.35, 0.12, timber)
      .position.set(c.window.x, rearY - 0.15, winBottom - 0.075);

    this.createExitDoor(timber, doorMin, doorMax);
  }

  private rearPanel(left: number, right: number, bottom: number, top: number): void {
    const c = CABIN_LAYOUT;
    if (right <= left || top <= bottom) return;
    this.box(right - left, c.wallThickness, top - bottom, this.wallMaterial)
      .position.set((left + right) / 2, c.halfDepth, (bottom + top) / 2);
  }

  private sidePanel(front: number, back: number, bottom: number, top: number): void {
    const c = CABIN_LAYOUT;
    if (back <= front || top <= bottom) return;
    this.box(c.wallThickness, back - front, top - bottom, this.wallMaterial)
      .position.set(c.halfWidth, (front + back) / 2, (bottom + top) / 2);
  }

  private createExitDoor(timber: THREE.Material, doorMin: number, doorMax: number): void {
    const c = CABIN_LAYOUT;
    const doorWidth = doorMax - doorMin;
    const doorHeight = c.door.topZ - c.floorZ;
    const doorwayX = c.halfWidth;
    const jambWidth = 0.12;

    this.box(0.24, jambWidth, doorHeight + 0.13, timber)
      .position.set(doorwayX, doorMin, c.floorZ + doorHeight / 2);
    this.box(0.24, jambWidth, doorHeight + 0.13, timber)
      .position.set(doorwayX, doorMax, c.floorZ + doorHeight / 2);
    this.box(0.24, doorWidth + 0.2, 0.14, timber)
      .position.set(doorwayX, c.door.y, c.door.topZ + 0.04);
    this.box(0.36, doorWidth + 0.12, 0.07, timber)
      .position.set(doorwayX - 0.02, c.door.y, c.floorZ + 0.035);

    // A thin door slab hinged around the vertical Z axis. The leaf is open
    // INTO the cabin instead of appearing as a flat rectangle on a wall.
    const hinge = new THREE.Group();
    hinge.position.set(doorwayX - 0.02, doorMax - 0.08, c.floorZ + 0.09);
    hinge.rotation.z = -0.66;
    this.root.add(hinge);
    const slabHeight = doorHeight - 0.16;
    const slabWidth = doorWidth - 0.16;
    const slab = this.box(0.10, slabWidth, slabHeight, this.edgeMaterial, hinge);
    slab.position.set(0, -slabWidth / 2, slabHeight / 2);
    const panel = this.box(0.022, slabWidth * 0.68, slabHeight * 0.33, timber, hinge);
    panel.position.set(-0.061, -slabWidth * 0.50, slabHeight * 0.62);

    const handle = new THREE.Mesh(
      this.trackGeometry(new THREE.SphereGeometry(0.062, 8, 6)),
      this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xbea477, metalness: 0.36, roughness: 0.48 }))
    );
    handle.position.set(-0.09, -slabWidth * 0.84, slabHeight * 0.47);
    hinge.add(handle);

    // Dark corridor is geometrically beyond the right-hand wall, and the
    // threshold remains open (no opaque wall hidden behind the door).
    this.box(0.12, doorWidth - 0.11, doorHeight, this.trackMaterial(
      new THREE.MeshBasicMaterial({ color: 0x211f20, side: THREE.DoubleSide })
    )).position.set(c.halfWidth + 0.48, c.door.y, c.floorZ + doorHeight / 2);
  }

  private createTable(timber: THREE.Material): void {
    const c = CABIN_LAYOUT;
    const tabletop = this.box(9.25, 5.5, 0.25, this.deskMaterial);
    tabletop.position.set(0, -0.13, c.tableTopZ - 0.125);

    // Four legs are genuinely vertical (Z); old legs were little blocks
    // arranged in the image plane and never reached the floor.
    const legHeight = c.tableTopZ - 0.25 - c.floorZ;
    const legGeometry = this.trackGeometry(new THREE.BoxGeometry(0.36, 0.36, legHeight));
    for (const x of [-4.18, 4.18]) {
      for (const y of [-2.32, 2.05]) {
        const leg = new THREE.Mesh(legGeometry, timber);
        leg.position.set(x, y, c.floorZ + legHeight / 2);
        this.root.add(leg);
      }
    }

    this.box(8.7, 0.18, 0.40, this.edgeMaterial)
      .position.set(0, -2.78, c.tableTopZ - 0.47);
    this.box(8.7, 0.18, 0.40, this.edgeMaterial)
      .position.set(0, 2.52, c.tableTopZ - 0.47);
    for (const x of [-4.39, 4.39]) {
      this.box(0.16, 5.10, 0.40, this.edgeMaterial)
        .position.set(x, -0.13, c.tableTopZ - 0.47);
    }

    // Lightweight contact shade (only two triangles) rather than shadow maps.
    const contactMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0x26180d, transparent: true, opacity: 0.17, depthWrite: false,
      side: THREE.DoubleSide
    }));
    const contact = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(8.9, 5.35)), contactMaterial);
    contact.position.set(0, -0.13, c.floorZ + 0.012);
    this.root.add(contact);
  }

  private createSignature(): void {
    const signatureTexture = this.trackTexture(createDeskSignatureTexture());
    const signatureMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: signatureTexture, transparent: true, opacity: 0.76,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.94
    }));
    const signature = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(0.8, 0.27)), signatureMaterial
    );
    signature.position.set(-2.92, 0.25, CABIN_LAYOUT.tableTopZ + 0.006);
    signature.rotation.z = -0.025;
    this.root.add(signature);
  }

  private box(width: number, depth: number, height: number, material: THREE.Material, parent = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(width, depth, height)), material
    );
    parent.add(mesh);
    return mesh;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }
}

function createDeskSignatureTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível para assinatura da mesa.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'middle';
  const draw = (color: string, dx: number, dy: number): void => {
    context.fillStyle = color;
    context.font = '500 58px Georgia, serif';
    context.fillText('©', 98 + dx, 82 + dy);
    context.font = '600 78px Georgia, serif';
    context.fillText('Bk', 170 + dx, 82 + dy);
  };
  draw('rgba(242,199,146,0.24)', 2, 3);
  draw('rgba(44,25,15,0.69)', 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
