import { useEditorStore } from "./store";
import { Mask } from "@/engine/mask";
import type { SceneData } from "@/engine/scene";

/**
 * Load a scene received from a share link / URL hash into the editor store.
 * Unlike a bare setScene, this also rebuilds the runtime Mask from the scene's
 * base64 PNG — otherwise masked regions are silently dropped on shared scenes.
 */
export async function applySharedScene(scene: SceneData): Promise<void> {
  const store = useEditorStore.getState();
  store.setScene(scene);
  if (scene.image?.data) store.setImageUrl(scene.image.data);
  if (scene.mask?.data) {
    try {
      const mask = await Mask.fromBase64Auto(scene.mask.data);
      useEditorStore.getState().setMask(mask);
    } catch {
      /* corrupt mask data — leave the scene mask-less rather than crash */
    }
  }
}
