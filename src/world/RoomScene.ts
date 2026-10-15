import * as THREE from 'three';
import { createFloorTexture, createWallTexture, createWoodTexture } from './WorldMaterialTextures';

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
    const woodTexture = this.trackTexture(createWoodTexture());
    const floorTexture = this.trackTexture(createFloorTexture());
    const wallTexture = this.trackTexture(createWallTexture());

    this.deskMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTexture,
      roughness: 0.86,
      metalness: 0,
      emissive: 0x392115,
      emissiveIntensity: 0.025
    }));
    this.edgeMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x69432e,
      map: woodTexture,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x2b1a12,
      emissiveIntensity: 0.03
    }));

    // Desk: keep the reading surface where the book already expects it, but give the
    // front and side enough thickness to read as furniture instead of a flat texture.
    const desk = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.2, 5.5, 0.34)), this.deskMaterial);
    desk.position.set(0, 0.14, -0.48);
    this.root.add(desk);

    const frontEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.28, 0.22, 0.34)), this.edgeMaterial);
    frontEdge.position.set(0, -2.61, -0.4);
    this.root.add(frontEdge);

    const apron = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(8.85, 0.34, 0.56)), this.edgeMaterial);
    apron.position.set(0, -2.78, -0.72);
    this.root.add(apron);

    const rightEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.22, 5.45, 0.34)), this.edgeMaterial);
    rightEdge.position.set(4.57, 0.13, -0.43);
    this.root.add(rightEdge);

    const legGeometry = this.trackGeometry(new THREE.BoxGeometry(0.36, 0.42, 1.45));
    const frontLeftLeg = new THREE.Mesh(legGeometry, this.edgeMaterial);
    frontLeftLeg.position.set(-4.05, -2.55, -1.05);
    this.root.add(frontLeftLeg);
    const frontRightLeg = new THREE.Mesh(legGeometry, this.edgeMaterial);
    frontRightLeg.position.set(4.05, -2.55, -1.05);
    this.root.add(frontRightLeg);

    // Floor is intentionally lighter and warmer than the plaster wall. The tilt makes
    // the upper edge recede from the camera, giving the lower room an actual floor read.
    this.floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xc79f73,
      map: floorTexture,
      roughness: 0.93,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x5a4028,
      emissiveIntensity: 0.035
    }));
    const floor = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(12.4, 6.2)), this.floorMaterial);
    floor.position.set(0, -2.55, -1.46);
    floor.rotation.x = -0.38;
    this.root.add(floor);

    // The wall now faces the camera as one continuous plaster plane. Previously the
    // geometry mostly extended through depth, which made the floor/background read as
    // the wall and created inconsistent patches around the mirror.
    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x806a61,
      map: wallTexture,
      roughness: 0.985,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x382c29,
      emissiveIntensity: 0.04
    }));

    const backWall = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(12.4, 6.4)), this.wallMaterial);
    backWall.position.set(0, 2.42, -1.68);
    this.root.add(backWall);

    const sideWall = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(3.6, 6.4)), this.wallMaterial);
    sideWall.position.set(5.45, 1.55, -0.15);
    sideWall.rotation.y = -Math.PI / 2 + 0.04;
    this.root.add(sideWall);

    const trimMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x503a30,
      roughness: 0.91,
      metalness: 0,
      emissive: 0x241913,
      emissiveIntensity: 0.025
    }));
    const baseboard = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(11.65, 0.13, 0.13)), trimMaterial);
    baseboard.position.set(0, -0.58, -1.5);
    this.root.add(baseboard);

    const cornerTrim = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.12, 6.0, 0.12)), trimMaterial);
    cornerTrim.position.set(5.12, 2.08, -1.24);
    this.root.add(cornerTrim);

    const contactMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0x20140e,
      transparent: true,
      opacity: 0.105,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    const contact = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(5.4, 2.7)), contactMaterial);
    contact.position.set(0, 0.03, -0.292);
    this.root.add(contact);

    const signatureTexture = this.trackTexture(createDeskSignatureTexture());
    const signatureMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      map: signatureTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      roughness: 0.97,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    const signature = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(0.8, 0.27)),
      signatureMaterial
    );
    signature.position.set(-2.82, 0.18, -0.287);
    signature.rotation.z = -0.028;
    this.root.add(signature);
  }

  public setWallColor(hex: number): void {
    const coherent = new THREE.Color(hex).lerp(WALL_NEUTRAL, 0.32);
    this.wallMaterial.color.copy(coherent);
    this.wallMaterial.emissive.copy(coherent).multiplyScalar(0.38);
  }

  public setAmbientReadability(hemisphereIntensity: number): void {
    const normalized = THREE.MathUtils.clamp((hemisphereIntensity - 0.62) / 0.82, 0, 1);
    const night = 1 - normalized;
    this.wallMaterial.emissiveIntensity = 0.045 + night * 0.13;
    this.floorMaterial.emissiveIntensity = 0.035 + night * 0.105;
    this.deskMaterial.emissiveIntensity = 0.022 + night * 0.082;
    this.edgeMaterial.emissiveIntensity = 0.026 + night * 0.072;
  }

  public dispose(): void {
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
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

  const copyrightX = 96;
  const baselineY = 82;
  const bkX = 170;

  context.fillStyle = 'rgba(242, 199, 146, 0.22)';
  context.font = '500 58px Georgia, serif';
  context.fillText('©', copyrightX + 2, baselineY + 3);
  context.font = '600 78px Georgia, serif';
  context.fillText('Bk', bkX + 2, baselineY + 3);

  context.fillStyle = 'rgba(44, 25, 15, 0.66)';
  context.font = '500 58px Georgia, serif';
  context.fillText('©', copyrightX, baselineY);
  context.font = '600 78px Georgia, serif';
  context.fillText('Bk', bkX, baselineY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}