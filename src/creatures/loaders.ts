import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let loader: GLTFLoader | null = null;

/**
 * Ein gemeinsamer GLTFLoader mit allen Decodern, die gltf-transform erzeugen kann:
 * Draco und Meshopt für Geometrie, KTX2/Basis für Texturen.
 * Die Decoder liegen lokal unter /decoders (kein CDN nötig).
 */
export function initLoaders(renderer: WebGLRenderer) {
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}decoders/draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}decoders/basis/`).detectSupport(renderer);
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

export function gltfLoader(): GLTFLoader {
  if (!loader) throw new Error('initLoaders() wurde nicht aufgerufen');
  return loader;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
