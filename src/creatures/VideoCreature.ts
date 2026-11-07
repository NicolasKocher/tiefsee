import {
  CustomBlending,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  Vector4,
  VideoTexture,
  AddEquation,
  LinearMipmapLinearFilter,
} from 'three';
import { Creature, type CreatureContext } from './Creature';
import { assetUrl } from './loaders';
import { U } from '../scene/uniforms';

/**
 * Echtes Filmmaterial auf einer Fläche, eingebettet in Nebel und Licht der Szene.
 * Key-Modi:
 *  - luma:   Helligkeit wird zur Deckkraft. Ideal für Tiefsee-Clips vor Schwarz.
 *            Composite mit vormultipliziertem Alpha, dadurch keine dunklen Säume.
 *  - screen: rein additiv, für leuchtende Tiere.
 *  - color:  Farbabstand zu einer Hintergrundfarbe (z. B. offenes Blauwasser).
 * Die Fläche dreht sich nur um die Hochachse zur Kamera.
 */
export class VideoCreature extends Creature {
  private video: HTMLVideoElement | null = null;
  private texture: VideoTexture | null = null;
  private material: ShaderMaterial | null = null;
  private mesh: Mesh | null = null;
  private playing = false;

  async load() {
    const v = this.config.video!;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    // WebM bevorzugt, MP4 als Fallback
    const base = assetUrl(this.config.asset!).replace(/\.(webm|mp4)$/i, '');
    for (const [ext, type] of [
      ['webm', 'video/webm'],
      ['mp4', 'video/mp4'],
    ]) {
      const src = document.createElement('source');
      src.src = `${base}.${ext}`;
      src.type = type;
      video.appendChild(src);
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Video-Timeout')), 20000);
      video.addEventListener('loadeddata', () => (clearTimeout(t), resolve()), { once: true });
      video.addEventListener('error', () => (clearTimeout(t), reject(new Error('Video-Fehler'))), { once: true });
      video.load();
    });
    this.video = video;
    video.playbackRate = v.playbackRate ?? 1;

    const tex = new VideoTexture(video);
    tex.colorSpace = SRGBColorSpace;
    if (v.key === 'match') {
      // Mipmaps für die lokale Hintergrundschätzung
      tex.generateMipmaps = true;
      tex.minFilter = LinearMipmapLinearFilter;
    }
    this.texture = tex;

    const crop = v.crop ?? [0, 0, 1, 1];
    const aspect = (video.videoWidth * (crop[2] - crop[0])) / (video.videoHeight * (crop[3] - crop[1]));
    const geo = new PlaneGeometry(v.width, v.width / aspect);
    const keyMode = { luma: 0, screen: 1, color: 2, match: 3 }[v.key];

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: keyMode === 1 ? OneFactor : OneMinusSrcAlphaFactor,
      uniforms: {
        map: { value: tex },
        uCrop: { value: new Vector4(...crop) },
        uKeyMode: { value: keyMode },
        uThreshold: { value: v.threshold ?? 0.06 },
        uSoftness: { value: v.softness ?? 0.12 },
        uKeyColor: { value: new Vector3(...(v.keyColor ?? [0, 0, 0])) },
        uExposure: { value: v.exposure ?? 1 },
        uSaturation: { value: v.saturation ?? 1 },
        uFeather: { value: v.edgeFeather ?? 0.12 },
        uFlip: { value: v.flipX ? 1 : 0 },
        uOpacity: { value: 1 },
        uLumaWeight: { value: v.lumaWeight ?? 0.5 },
        uMatte: { value: v.matte ?? 0 },
        uDebug: { value: 0 },
        uBaseAlpha: { value: v.baseAlpha ?? 0.5 },
        uWaterMatch: { value: v.waterMatch ?? 1 },
        uBgLod: { value: 5.5 },
        uLocalKey: { value: v.localKey ? 1 : 0 },
        uWater: U.uWater,
        uFogDensity: U.uFogDensity,
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec4 uCrop;
        uniform int uKeyMode;
        uniform float uThreshold;
        uniform float uSoftness;
        uniform vec3 uKeyColor;
        uniform float uExposure;
        uniform float uSaturation;
        uniform float uFeather;
        uniform float uFlip;
        uniform float uOpacity;
        uniform vec3 uWater;
        uniform float uFogDensity;
        uniform float uLumaWeight;
        uniform float uMatte;
        uniform float uDebug;
        uniform float uBaseAlpha;
        uniform float uWaterMatch;
        uniform float uBgLod;
        uniform float uLocalKey;
        varying vec2 vUv;
        varying float vDist;
        vec3 toYCC(vec3 c) {
          float y = dot(c, vec3(0.299, 0.587, 0.114));
          return vec3(y, (c.b - y) * 0.565, (c.r - y) * 0.713);
        }
        void main() {
          vec2 uv = vUv;
          if (uFlip > 0.5) uv.x = 1.0 - uv.x;
          uv = mix(uCrop.xy, uCrop.zw, uv);
          // Videotexturen kommen hier als sRGB-Werte an: Key auf sRGB, Rechnung linear
          vec3 cs = texture2D(map, uv).rgb;
          vec3 c = pow(max(cs, 0.0), vec3(2.2));
          float a = 1.0;
          if (uKeyMode == 0) {
            // Luma-Key (schwarzer Hintergrund): Helligkeit wird zur Deckkraft
            float l = dot(cs, vec3(0.2126, 0.7152, 0.0722));
            a = smoothstep(uThreshold, uThreshold + uSoftness, l);
            c *= smoothstep(uThreshold * 0.5, uThreshold + uSoftness * 0.5, l);
          } else if (uKeyMode == 2) {
            // Farb-Key im YCbCr-Raum: Chroma-Abstand plus gewichteter Helligkeitsabstand
            vec3 ycc = toYCC(cs);
            vec3 kcc = toYCC(uKeyColor);
            vec3 dd = ycc - kcc;
            float d = length(vec3(dd.x * uLumaWeight, dd.yz * 2.0));
            a = smoothstep(uThreshold, uThreshold + uSoftness, d);
            // Hintergrund exakt herausrechnen (c = a*F + (1-a)*B), verhindert blaue Säume
            vec3 bgLin = pow(uKeyColor, vec3(2.2));
            // Restfarbe nur dort, wo wirklich Tier ist: sonst addiert sich die Abweichung
            // des echten Hintergrunds vom Mittelwert als milchiger Schleier
            c = max(c - (1.0 - a) * bgLin, 0.0) * smoothstep(0.0, 0.5, a);
          }
          else if (uKeyMode == 3) {
            // Match: Clip-Hintergrund farblich auf das Szenenwasser verschieben.
            // Das Tier (Chroma-Abstand zum Hintergrund) bleibt deckend, der Hintergrund
            // wird halbtransparent und geht nahtlos ins Wasser der Szene über.
            vec3 bgS = textureLod(map, uv, uBgLod).rgb;
            vec3 ycc = toYCC(cs);
            // Vergleich mit fester Hintergrundfarbe oder mit dem lokal geschätzten Hintergrund
            vec3 kcc = toYCC(mix(uKeyColor, bgS, uLocalKey));
            vec3 dd = ycc - kcc;
            float d = length(vec3(dd.x * uLumaWeight, dd.yz * 2.0));
            float ka = smoothstep(uThreshold, uThreshold + uSoftness, d);
            // Hintergrund pro Pixel aus einer stark unscharfen Mip-Stufe schätzen:
            // gleicht Licht-Verläufe im Clip aus, Details (das Tier) bleiben erhalten
            vec3 bgLocal = pow(bgS, vec3(2.2));
            vec3 shift = uWater * uWaterMatch - bgLocal;
            c = max(c + shift * (1.0 - ka * 0.5), 0.0);
            a = mix(uBaseAlpha, 1.0, ka);
            c *= a;
          }
          // elliptische Maske gegen Verläufe in den Bildecken
          if (uMatte > 0.0) {
            vec2 q = (vUv - 0.5) * 2.0;
            a *= 1.0 - smoothstep(uMatte, 1.0, length(q));
            c *= 1.0 - smoothstep(uMatte, 1.0, length(q));
          }
          float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(g), c, uSaturation) * uExposure;
          // weiche Ränder, damit nie eine Kante der Fläche sichtbar wird
          vec2 e = smoothstep(vec2(0.0), vec2(uFeather), vUv) * smoothstep(vec2(0.0), vec2(uFeather), 1.0 - vUv);
          float edge = e.x * e.y;
          a *= edge;
          c *= edge;
          // Nebel: Clip verschwindet mit der Entfernung im Wasser
          float fog = exp(-uFogDensity * uFogDensity * vDist * vDist);
          c = mix(uWater * a, c, fog);
          a *= uOpacity;
          c *= uOpacity;
          if (uDebug > 0.5) {
            gl_FragColor = vec4(vec3(a), 1.0);
            return;
          }
          if (uKeyMode == 1) {
            gl_FragColor = vec4(c, 0.0);
          } else {
            gl_FragColor = vec4(c, a);
          }
        }
      `,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.renderOrder = 6;
    this.body.add(this.mesh);
  }

  protected animate(ctx: CreatureContext) {
    if (!this.mesh) return;
    // Billboard um die Hochachse: Rotation des Körpers aufheben und zur Kamera drehen
    this.body.quaternion.identity();
    const p = this.root.position;
    this.mesh.rotation.y = Math.atan2(ctx.camPos.x - p.x, ctx.camPos.z - p.z);
    // Dekodieren kostet: nur abspielen, wenn das Tier wirklich in der Nähe ist
    const shouldPlay = this.root.visible && Math.abs(this.relativeY(ctx.camY)) < 45;
    if (shouldPlay && !this.playing) {
      this.video?.play().catch(() => {});
      this.playing = true;
    } else if (!shouldPlay && this.playing) {
      this.video?.pause();
      this.playing = false;
    }
  }

  protected applyOpacity(o: number) {
    if (this.material) this.material.uniforms.uOpacity.value = o;
    if (o <= 0.001 && this.playing) {
      this.video?.pause();
      this.playing = false;
    }
  }

  dispose() {
    this.video?.pause();
    if (this.video) this.video.src = '';
    this.texture?.dispose();
    super.dispose();
  }
}
