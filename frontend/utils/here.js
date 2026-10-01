const chaveHere = process.env.NEXT_PUBLIC_HERE_API_KEY;

export function obterEstiloMapaHere() {
  if (!chaveHere) return null;

  const chave = encodeURIComponent(chaveHere);
  return {
    version: 8,
    sources: {
      here: {
        attribution: '© HERE',
        maxzoom: 20,
        tileSize: 512,
        tiles: [`https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?apiKey=${chave}&lang=pt&size=512&style=explore.day`],
        type: 'raster',
      },
    },
    layers: [{ id: 'here-base', source: 'here', type: 'raster' }],
  };
}
