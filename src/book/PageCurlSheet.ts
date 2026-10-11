import * as THREE from 'three';

export class PageCurlSheet {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    uFrontMap: { value: THREE.Texture };
    uBackMap: { value: THREE.Texture };
    uProgress: { value: number };
    uTwist: { value: number };
    uWidth: { value: number };
  };

  public constructor(width: number, height: number, front: THREE.Texture, back: THREE.Texture) {
    const geometry = new THREE.PlaneGeometry(width, height, 40, 28);
    geometry.translate(width / 2, 0, 0);

    this.uniforms = {
      uFrontMap: { value: front },
      uBackMap: { value: back },
      uProgress: { value: 0 },
      uTwist: { value: 0 },
      uWidth: { value: width }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: false,
      vertexShader: `
        uniform float uProgress;
        uniform float uTwist;
        uniform float uWidth;
        varying vec2 vUv;
        varying float vFold;

        void main() {
          vUv = uv;
          vec3 p = position;
          float pageU = clamp(p.x / uWidth, 0.0, 1.0);
          float envelope = sin(uProgress * 3.14159265);
          float curl = (pageU - 0.5) * 0.95 * envelope;
          float angle = uProgress * 3.14159265 + curl;
          angle += uTwist * pageU * 0.20 * envelope;

          float distanceFromSpine = p.x;
          float bentX = cos(angle) * distanceFromSpine;
          float bentZ = -sin(angle) * distanceFromSpine;
          bentZ += sin(pageU * 3.14159265) * 0.18 * envelope;

          p.x = bentX;
          p.z = bentZ;
          p.y += uTwist * (pageU - 0.5) * 0.10 * envelope;

          vFold = envelope * (0.35 + 0.65 * sin(pageU * 3.14159265));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uFrontMap;
        uniform sampler2D uBackMap;
        uniform float uProgress;
        varying vec2 vUv;
        varying float vFold;

        void main() {
          vec2 sampleUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
          vec4 paper = gl_FrontFacing ? texture2D(uFrontMap, sampleUv) : texture2D(uBackMap, sampleUv);
          float foldShade = 1.0 - vFold * 0.22;
          float edgeShade = 0.96 + 0.04 * sin(sampleUv.x * 3.14159265);
          gl_FragColor = vec4(paper.rgb * foldShade * edgeShade, paper.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 5;
  }

  public setProgress(progress: number): void {
    this.uniforms.uProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
  }

  public setTwist(twist: number): void {
    this.uniforms.uTwist.value = THREE.MathUtils.clamp(twist, -1, 1);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
