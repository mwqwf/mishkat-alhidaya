let globalMedia = null;
let globalType = null; // 'audio' or 'video'

export function getGlobalMedia() {
  return { media: globalMedia, type: globalType };
}

export async function setGlobalMedia(newMedia, type) {
  if (globalMedia && globalMedia !== newMedia) {
    try {
      await globalMedia.unloadAsync();
    } catch (e) {}
  }
  globalMedia = newMedia;
  globalType = type;
}

export async function unloadGlobalMedia() {
  if (globalMedia) {
    try {
      await globalMedia.unloadAsync();
    } catch (e) {}
    globalMedia = null;
    globalType = null;
  }
} 