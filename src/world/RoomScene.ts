import * as THREE from 'three';
import { createFloorTexture, createWallTexture, createWoodTexture } from './WorldMaterialTextures';

export class RoomScene {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly wallMaterial: THREE.MeshStandardMaterial;

  public constructor() {
    const woodTexture = this.trackTexture(createWoodTexture());
    const floorTexture = this.trackTexture(createFloorTexture());
    const wallTexture = this.trackTexture(createWallTexture());

    const deskMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTexture,
      roughness: 0.88,
      metalness: 0
    }));
    const edgeMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x6a4631,
      map: woodTexture,
      roughness: 0.91,
      metalness: 0
    }));

    // A smaller, thicker tabletop leaves the foreground floor visible and makes the
    // piece read as furniture instead of an infinite brown plane.
    const desk = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.2, 5.5, 0.34)), deskMaterial);
    desk.position.set(0, 0.14, -0.48);
    this.root.add(desk);

    const frontEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(9.28, 0.2, 0.28)), edgeMaterial);
    frontEdge.position.set(0, -2.61, -0.43);
    this.root.add(frontEdge);

    const apron = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(8.85, 0.16, 0.64)), edgeMaterial);
    apron.position.set(0, -2.66, -0.79);
    this.root.add(apron);

    const rightEdge = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.2, 5.45, 0.3)), edgeMaterial);
    rightEdge.position.set(4.57, 0.13, -0.46);
    this.root.add(rightEdge);

    const legGeometry = this.trackGeometry(new THREE.BoxGeometry(0.32, 0.34, 1.4));
    const frontLeftLeg = new THREE.Mesh(legGeometry, edgeMaterial);
    frontLeftLeg.position.set(-4.05, -2.34, -1.12);
    this.root.add(frontLeftLeg);
    const frontRightLeg = new THREE.Mesh(legGeometry, edgeMaterial);
    frontRightLeg.position.set(4.05, -2.34, -1.12);
    this.root.add(frontRightLeg);

    const floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xc3a585,
      map: floorTexture,
      roughness: 0.96,
      metalness: 0
    }));
    const floor = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(11.2, 9.2, 0.2)), floorMaterial);
    floor.position.set(0, -0.45, -1.73);
    this.root.add(floor);

    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x73594c,
      map: wallTexture,
      roughness: 0.99,
      metalness: 0,
      side: THREE.DoubleSide
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

    // Soft contact patches fake the tiny grounding shadows we intentionally avoid
    // generating with a full shadow-map pass on mobile.
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
  }

  public setWallColor(hex: number): void {
    this.wallMaterial.color.setHex(hex);
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
