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

    this.floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xd0aa7e,
      map: floorTexture,
      roughness: 0.93,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x5a4028,
      emissiveIntensity: 0.035
    }));
    const floor = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(15.6, 9.2)), this.floorMaterial);
    floor.position.set(0.5, -3.36, -1.34);
    floor.rotation.x = -0.34;
    this.root.add(floor);

    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x806a61,
      map: wallTexture,
      roughness: 0.985,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: 0x382c29,
      emissiveIntensity: 0.04
    }));

    const wallBottom = -0.72;
    const wallTop = 5.62;
    const wallLeft = -6.35;
    const wallRight = 6.35;
    const doorLeft = 3.78;
    const doorRight = 5.38;
    const doorTop = 2.72;
    const wallZ = -1.68;

    this.addWallPanel(wallLeft, doorLeft, wallBottom, wallTop, wallZ);
    this.addWallPanel(doorRight, wallRight, wallBottom, wallTop, wallZ);
    this.addWallPanel(doorLeft, doorRight, doorTop, wallTop, wallZ);

    const trimMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x503a30,
      roughness: 0.91,
      metalness: 0,
      emissive: 0x241913,
      emissiveIntensity: 0.025
    }));

    const leftBaseboardWidth = doorLeft - (wallLeft + 0.18);
    const leftBaseboard = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(leftBaseboardWidth, 0.13, 0.13)),
      trimMaterial
    );
    leftBaseboard.position.set(wallLeft + 0.18 + leftBaseboardWidth * 0.5, -0.58, -1.5);
    this.root.add(leftBaseboard);

    const rightBaseboardWidth = Math.max(0.3, wallRight - doorRight - 0.18);
    const rightBaseboard = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(rightBaseboardWidth, 0.13, 0.13)),
      trimMaterial
    );
    rightBaseboard.position.set(doorRight + rightBaseboardWidth * 0.5, -0.58, -1.5);
    this.root.add(rightBaseboard);

    this.createExitDoor(woodTexture, trimMaterial, doorLeft, doorRight, wallBottom, doorTop, wallZ);

    // Foreground wall: intentionally outside the normal reading crop. It only enters the
    // composition near maximum zoom-out and makes the desk read as sitting inside an
    // actual room. It reuses the exact same plaster material as the mirror wall, so the
    // two walls cannot drift into unrelated colors again.
    const foregroundWall = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(14.5, 1.35, 0.32)),
      this.wallMaterial
    );
    foregroundWall.position.set(0.35, -5.34, 0.18);
    this.root.add(foregroundWall);

    const foregroundCap = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(14.65, 0.12, 0.42)),
      trimMaterial
    );
    foregroundCap.position.set(0.35, -4.64, 0.2);
    this.root.add(foregroundCap);

    const foregroundBase = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(14.35, 0.12, 0.16)),
      trimMaterial
    );
    foregroundBase.position.set(0.35, -5.95, 0.02);
    this.root.add(foregroundBase);

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

  private addWallPanel(left: number, right: number, bottom: number, top: number, z: number): void {
    const width = Math.max(0.01, right - left);
    const height = Math.max(0.01, top - bottom);
    const panel = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(width, height)), this.wallMaterial);
    panel.position.set((left + right) * 0.5, (bottom + top) * 0.5, z);
    this.root.add(panel);
  }

  private createExitDoor(
    woodTexture: THREE.Texture,
    trimMaterial: THREE.Material,
    doorLeft: number,
    doorRight: number,
    doorBottom: number,
    doorTop: number,
    wallZ: number
  ): void {
    const openingWidth = doorRight - doorLeft;
    const openingHeight = doorTop - doorBottom;

    const hallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x2e2b27,
      roughness: 1,
      metalness: 0,
      emissive: 0x171b20,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide
    }));
    const hall = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(openingWidth - 0.08, openingHeight - 0.05)),
      hallMaterial
    );
    hall.position.set((doorLeft + doorRight) * 0.5, (doorBottom + doorTop) * 0.5, wallZ - 0.09);
    this.root.add(hall);

    const threshold = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(openingWidth + 0.16, 0.26, 0.11)),
      this.edgeMaterial
    );
    threshold.position.set((doorLeft + doorRight) * 0.5, doorBottom + 0.04, wallZ + 0.12);
    this.root.add(threshold);

    const outsideFloor = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(openingWidth + 0.5, 2.2)),
      this.floorMaterial
    );
    outsideFloor.position.set((doorLeft + doorRight) * 0.5, doorBottom - 0.32, wallZ - 0.62);
    outsideFloor.rotation.x = -Math.PI / 2;
    outsideFloor.rotation.z = Math.PI;
    this.root.add(outsideFloor);

    const frameThickness = 0.12;
    const leftJamb = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(frameThickness, openingHeight + 0.18, 0.18)),
      trimMaterial
    );
    leftJamb.position.set(doorLeft - frameThickness * 0.25, (doorBottom + doorTop) * 0.5, wallZ + 0.03);
    this.root.add(leftJamb);

    const rightJamb = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(frameThickness, openingHeight + 0.18, 0.18)),
      trimMaterial
    );
    rightJamb.position.set(doorRight + frameThickness * 0.25, (doorBottom + doorTop) * 0.5, wallZ + 0.03);
    this.root.add(rightJamb);

    const lintel = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(openingWidth + 0.22, 0.13, 0.18)),
      trimMaterial
    );
    lintel.position.set((doorLeft + doorRight) * 0.5, doorTop + 0.05, wallZ + 0.03);
    this.root.add(lintel);

    const doorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x6a432c,
      map: woodTexture,
      roughness: 0.82,
      metalness: 0,
      emissive: 0x27160f,
      emissiveIntensity: 0.025
    }));

    const hinge = new THREE.Group();
    hinge.position.set(doorRight - 0.035, (doorBottom + doorTop) * 0.5, wallZ + 0.07);
    hinge.rotation.y = 0.72;
    this.root.add(hinge);

    const slabWidth = openingWidth - 0.13;
    const slabHeight = openingHeight - 0.16;
    const slab = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(slabWidth, slabHeight, 0.09)),
      doorMaterial
    );
    slab.position.x = -slabWidth * 0.5;
    hinge.add(slab);

    const panelMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x4e2f21,
      roughness: 0.88,
      metalness: 0,
      emissive: 0x1c100b,
      emissiveIntensity: 0.02
    }));
    for (const y of [-0.74, 0.56]) {
      const inset = new THREE.Mesh(
        this.trackGeometry(new THREE.BoxGeometry(slabWidth * 0.62, slabHeight * 0.28, 0.025)),
        panelMaterial
      );
      inset.position.set(-slabWidth * 0.5, y, 0.055);
      hinge.add(inset);
    }

    const knobMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xc1a16b,
      roughness: 0.38,
      metalness: 0.62
    }));
    const knob = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.055, 14, 10)), knobMaterial);
    knob.position.set(-slabWidth * 0.9, 0, 0.095);
    hinge.add(knob);
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
