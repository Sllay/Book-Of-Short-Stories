import * as THREE from 'three';
import { createWaxTexture } from './WorldMaterialTextures';

type CandlePhase = 'off' | 'lighting' | 'on' | 'extinguishing';

const LIGHT_ON_HOUR = 18.25;
const LIGHT_OFF_HOUR = 5.5;
const LIGHTING_DURATION = 2.6;
const EXTINGUISH_DURATION = 1.35;

export class CandleRig {
  public readonly root = new THREE.Group();
  public readonly light = new THREE.PointLight(0xffa85c, 0.9, 6.4, 1.8);

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly flame: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly flameCore: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly flameGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly smoke: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly matchRoot = new THREE.Group();
  private readonly matchFlame: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private phase: CandlePhase = 'off';
  private phaseTime = 0;
  private smokeTime = Number.POSITIVE_INFINITY;
  private initialized = false;
  private baseIntensity = 0.7;
  private focusMode = false;

  public constructor() {
    this.root.position.set(-3.08, 0.92, -0.31);

    const waxTexture = this.trackTexture(createWaxTexture());
    const waxMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xf1ddb8,
      map: waxTexture,
      roughness: 0.97,
      metalness: 0
    }));

    const wax = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.18, 0.22, 0.46, 24)), waxMaterial);
    wax.rotation.x = Math.PI / 2;
    wax.position.z = 0.27;
    this.root.add(wax);

    const meltedTop = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.17, 18, 10)), waxMaterial);
    meltedTop.scale.set(1, 0.94, 0.17);
    meltedTop.position.set(-0.01, 0.015, 0.5);
    this.root.add(meltedTop);

    const puddle = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.27, 0.3, 0.026, 26)), waxMaterial);
    puddle.rotation.x = Math.PI / 2;
    puddle.position.set(0.015, -0.01, 0.025);
    this.root.add(puddle);

    for (const [x, y, z, sx, sy, sz] of [
      [0.15, -0.055, 0.37, 0.72, 0.52, 1.65],
      [-0.135, 0.075, 0.33, 0.68, 0.48, 1.35],
      [0.035, 0.17, 0.405, 0.66, 0.5, 1.1]
    ] as const) {
      const drip = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.046, 10, 8)), waxMaterial);
      drip.scale.set(sx, sy, sz);
      drip.position.set(x, y, z);
      this.root.add(drip);
    }

    const wickMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x241711 }));
    const wick = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.01, 0.012, 0.085, 8)), wickMaterial);
    wick.rotation.x = Math.PI / 2;
    wick.position.z = 0.565;
    this.root.add(wick);

    const flameMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffb24f, toneMapped: false }));
    this.flame = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.072, 14, 12)), flameMaterial);
    this.flame.position.z = 0.67;
    this.root.add(this.flame);

    const coreMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xfff1b6,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false
    }));
    this.flameCore = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.04, 12, 10)), coreMaterial);
    this.flameCore.position.z = 0.665;
    this.root.add(this.flameCore);

    const glowMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xff9c4a,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      toneMapped: false
    }));
    this.flameGlow = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.2, 12, 10)), glowMaterial);
    this.flameGlow.position.z = 0.665;
    this.root.add(this.flameGlow);

    const smokeMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0x7d7a78,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false
    }));
    this.smoke = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.055, 10, 8)), smokeMaterial);
    this.smoke.position.z = 0.69;
    this.smoke.visible = false;
    this.root.add(this.smoke);

    const stickMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xb4824d,
      roughness: 0.9,
      metalness: 0
    }));
    const matchStick = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.34, 0.025, 0.025)), stickMaterial);
    matchStick.position.x = -0.17;
    this.matchRoot.add(matchStick);

    const headMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5f2f1f,
      roughness: 0.98,
      metalness: 0
    }));
    const matchHead = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.025, 10, 8)), headMaterial);
    matchHead.position.x = 0.01;
    this.matchRoot.add(matchHead);

    const matchFlameMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffb64e, toneMapped: false }));
    this.matchFlame = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.041, 10, 8)), matchFlameMaterial);
    this.matchFlame.scale.set(0.65, 0.65, 1.4);
    this.matchFlame.position.set(0.025, 0, 0.055);
    this.matchRoot.add(this.matchFlame);

    this.matchRoot.position.set(-1.1, -0.08, 0.63);
    this.matchRoot.rotation.z = -0.11;
    this.matchRoot.visible = false;
    this.root.add(this.matchRoot);

    this.light.position.copy(this.root.position).add(new THREE.Vector3(0, 0, 0.66));
    this.setFlameVisibility(0);
  }

  public setBaseIntensity(value: number): void {
    this.baseIntensity = Math.max(0, value);
  }

  public setFocusMode(enabled: boolean): void {
    this.focusMode = enabled;
  }

  public update(date: Date, deltaMs: number, ambientSeconds: number): void {
    const deltaSeconds = Math.max(0, Math.min(100, deltaMs)) / 1000;
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const shouldBeLit = hour >= LIGHT_ON_HOUR || hour < LIGHT_OFF_HOUR;

    if (!this.initialized) {
      this.initialized = true;
      this.phase = shouldBeLit ? 'on' : 'off';
      this.phaseTime = 0;
    } else if (shouldBeLit && (this.phase === 'off' || this.phase === 'extinguishing')) {
      this.phase = 'lighting';
      this.phaseTime = 0;
      this.smokeTime = Number.POSITIVE_INFINITY;
    } else if (!shouldBeLit && (this.phase === 'on' || this.phase === 'lighting')) {
      this.phase = 'extinguishing';
      this.phaseTime = 0;
    }

    this.phaseTime += deltaSeconds;
    if (Number.isFinite(this.smokeTime)) this.smokeTime += deltaSeconds;

    let visible = 0;
    if (this.phase === 'on') {
      visible = 1;
    } else if (this.phase === 'lighting') {
      visible = this.updateLightingAnimation();
    } else if (this.phase === 'extinguishing') {
      visible = this.updateExtinguishAnimation();
    } else {
      this.matchRoot.visible = false;
    }

    const flicker = 1
      + Math.sin(ambientSeconds * 7.7) * 0.036
      + Math.sin(ambientSeconds * 13.1 + 0.8) * 0.017
      + Math.sin(ambientSeconds * 3.2 + 2.1) * 0.012;
    const pulse = THREE.MathUtils.clamp(flicker, 0.935, 1.075);
    const focusFactor = this.focusMode ? 0.88 : 1;

    // The light is part of the night composition, not decoration to almost disable in
    // Focus Mode. It still softens slightly there, while continuing to reach the book.
    this.light.intensity = this.baseIntensity * visible * flicker * focusFactor * 1.18;
    this.flame.scale.set(0.66 * pulse * visible, 0.66 * pulse * visible, 1.52 / pulse * visible);
    this.flameCore.scale.set(0.47 * pulse * visible, 0.47 * pulse * visible, 1.05 / pulse * visible);

    const swayX = Math.sin(ambientSeconds * 5.8) * 0.009;
    const swayY = Math.sin(ambientSeconds * 4.1 + 1.2) * 0.007;
    this.flame.position.x = swayX;
    this.flame.position.y = swayY;
    this.flameCore.position.x = swayX * 0.55;
    this.flameCore.position.y = swayY * 0.55;
    this.flameGlow.scale.setScalar(Math.max(0.001, visible * (1 + Math.sin(ambientSeconds * 4.8) * 0.045)));

    this.flame.visible = visible > 0.015;
    this.flameCore.visible = visible > 0.025;
    this.flameGlow.visible = visible > 0.02;
    this.updateSmoke();
  }

  public dispose(): void {
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private updateLightingAnimation(): number {
    const t = THREE.MathUtils.clamp(this.phaseTime / LIGHTING_DURATION, 0, 1);
    this.matchRoot.visible = true;

    if (t < 0.36) {
      const p = THREE.MathUtils.smoothstep(t / 0.36, 0, 1);
      this.matchRoot.position.x = THREE.MathUtils.lerp(-1.1, -0.06, p);
      this.matchRoot.position.y = THREE.MathUtils.lerp(-0.1, 0.015, p);
      this.matchRoot.position.z = THREE.MathUtils.lerp(0.62, 0.61, p);
    } else if (t < 0.64) {
      this.matchRoot.position.x = -0.06;
      this.matchRoot.position.y = 0.015;
      this.matchRoot.position.z = 0.61;
    } else {
      const p = THREE.MathUtils.smoothstep((t - 0.64) / 0.36, 0, 1);
      this.matchRoot.position.x = THREE.MathUtils.lerp(-0.06, -1.18, p);
      this.matchRoot.position.y = THREE.MathUtils.lerp(0.015, -0.14, p);
      this.matchRoot.position.z = THREE.MathUtils.lerp(0.61, 0.54, p);
    }

    this.matchFlame.visible = t < 0.88;
    const ignition = THREE.MathUtils.smoothstep((t - 0.28) / 0.28, 0, 1);
    if (t >= 1) {
      this.phase = 'on';
      this.phaseTime = 0;
      this.matchRoot.visible = false;
      this.matchFlame.visible = true;
      return 1;
    }
    return ignition;
  }

  private updateExtinguishAnimation(): number {
    const t = THREE.MathUtils.clamp(this.phaseTime / EXTINGUISH_DURATION, 0, 1);
    this.matchRoot.visible = false;
    const eased = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
    this.flame.rotation.y = Math.sin(t * Math.PI * 5) * 0.18 * t;
    this.flame.rotation.x = Math.sin(t * Math.PI * 3) * 0.1 * t;
    this.flameCore.rotation.copy(this.flame.rotation);
    if (t >= 1) {
      this.phase = 'off';
      this.phaseTime = 0;
      this.smokeTime = 0;
      this.flame.rotation.set(0, 0, 0);
      this.flameCore.rotation.set(0, 0, 0);
      return 0;
    }
    return eased;
  }

  private updateSmoke(): void {
    const material = this.smoke.material;
    if (!Number.isFinite(this.smokeTime) || this.smokeTime > 1.4) {
      material.opacity = 0;
      this.smoke.visible = false;
      return;
    }

    const t = THREE.MathUtils.clamp(this.smokeTime / 1.4, 0, 1);
    this.smoke.visible = true;
    material.opacity = Math.sin(Math.PI * t) * 0.12;
    this.smoke.position.z = 0.69 + t * 0.28;
    this.smoke.position.x = Math.sin(t * 8) * 0.035;
    const scale = 0.7 + t * 1.8;
    this.smoke.scale.set(scale, scale * 0.72, scale * 1.25);
  }

  private setFlameVisibility(value: number): void {
    const safe = Math.max(0.001, value);
    this.flame.scale.setScalar(safe);
    this.flameCore.scale.setScalar(safe);
    this.flameGlow.scale.setScalar(safe);
    this.flame.visible = value > 0;
    this.flameCore.visible = value > 0;
    this.flameGlow.visible = value > 0;
    this.light.intensity = this.baseIntensity * value;
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