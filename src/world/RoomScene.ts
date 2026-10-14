import * as THREE from 'three';
import { createFloorTexture, createWallTexture, createWoodTexture } from './WorldMaterialTextures';

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
      roughness: 0.88,
      metalness: 0,
      emissive: 0x392115,
      emissiveIntensity: 0.025
    }));
    this.edgeMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x6a4631,
      map: woodTexture,
      roughness: 0.91,
      metalness: 0,
      emissive: 0x2b1a12,
      emissiveIntensity: 0.03
    }));

    const desk = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.2, 5.5, 0.34)), this.deskMaterial);
    desk.position.set(0, 0.14, -0.48);
    this.root.add(desk);

    const frontEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.28, 0.2, 0.28)), this.edgeMaterial);
    frontEdge.position.set(0, -2.61, -0.43);
    this.root.add(frontEdge);

    const apron = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(8.85, 0.16, 0.64)), this.edgeMaterial);
    apron.position.set(0, -2.66, -0.79);
    this.root.add(apron);

    const rightEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.2, 5.45, 0.3)), this.edgeMaterial);
    rightEdge.position.set(4.57, 0.13, -0.46);
    this.root.add(rightEdge);

    const legGeometry = this.trackGeometry(new THREE.BoxGeometry(0.32, 0.34, 1.4));
    const frontLeftLeg = new THREE.Mesh(legGeometry, this.edgeMaterial);
    frontLeftLeg.position.set(-4.05, -2.34, -1.12);
    this.root.add(frontLeftLeg);
    const frontRightLeg = new THREE.Mesh(legGeometry, this.edgeMaterial);
    frontRightLeg.position.set(4.05, -2.34, -1.12);
    this.root.add(frontRightLeg);

    this.floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xc3a585,
      map: floorTexture,
      roughness: 0.96,
      metalness: 0,
      emissive: 0x4b3828,
      emissiveIntensity: 0.035
    }));
    const floor = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(11.2, 9.2, 0.2)), this.floorMaterial);
    floor.position.set(0, -0.45, -1.73);
    this.root.add(floor);

    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x73594c,
      map: wallTexture,
      roughness: 0.99,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x33241f,
      emissiveIntensity: 0.04
    }));

    const rearWall = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.25, 0.16, 5.15)), this.wallMaterial);
    rearWall.position.set(0, 3.48, 0.78);
    this.root.add(rearWall);

    const rightWall = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.16, 6.95, 5.15)), this.wallMaterial);
    rightWall.position.set(4.56, 0.02, 0.78);
    this.root.add(rightWall);

    const trimMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x4a352b,
      roughness: 0.92,
      metalness: 0
    }));
    const rearBaseboard = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.25, 0.11, 0.18)), trimMaterial);
    rearBaseboard.position.set(0, 3.36, -1.48);
    this.root.add(rearBaseboard);

    const rightBaseboard = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.11, 6.85, 0.18)), trimMaterial);
    rightBaseboard.position.set(4.44, 0, -1.48);
    this.root.add(rightBaseboard);

    const contactMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0x20140e,
      transparent: true,
      opacity: 0.11,
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
      this.trackGeometry(new THREE.PlaneGeometry(0.72, 0.24)),
      signatureMaterial
    );
    // Keep the mark subtle, but place it inside the candle's warm falloff so the
    // engraved highlight comes alive at night instead of reading as a black stamp.
    signature.position.set(-2.66, 0.18, -0.287);
    signature.rotation.z = -0.028;
    this.root.add(signature);
  }

  public setWallColor(hex: number): void {
    this.wallMaterial.color.setHex(hex);
    this.wallMaterial.emissive.set(new THREE.Color(hex).multiplyScalar(0.42));
  }

  public setAmbientReadability(hemisphereIntensity: number): void {
    const normalized = THREE.MathUtils.clamp((hemisphereIntensity - 0.62) / 0.82, 0, 1);
    const night = 1 - normalized;
    this.wallMaterial.emissiveIntensity = 0.035 + night * 0.17;
    this.floorMaterial.emissiveIntensity = 0.025 + night * 0.13;
    this.deskMaterial.emissiveIntensity = 0.018 + night * 0.085;
    this.edgeMaterial.emissiveIntensity = 0.022 + night * 0.075;
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

  const copyrightX = 112;
  const baselineY = 82;
  const bkX = 190;

  context.fillStyle = 'rgba(242, 199, 146, 0.20)';
  context.font = '500 48px Georgia, serif';
  context.fillText('©', copyrightX + 2, baselineY + 3);
  context.font = '600 72px Georgia, serif';
  context.fillText('Bk', bkX + 2, baselineY + 3);

  context.fillStyle = 'rgba(44, 25, 15, 0.62)';
  context.font = '500 48px Georgia, serif';
  context.fillText('©', copyrightX, baselineY);
  context.font = '600 72px Georgia, serif';
  context.fillText('Bk', bkX, baselineY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
