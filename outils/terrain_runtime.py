#!/usr/bin/env python3
"""Construit des tuiles GLB terrain runtime depuis le MNT LiDAR HD 50 cm.

Les tuiles sont alignées sur le repère réellement consommé par index.html :
data/paris/terrain_hd/t_<i>_<j>.wasm. Le runtime tente ces tuiles en priorité,
puis revient automatiquement à data/paris/terrain/t_<i>_<j>.wasm.
"""
import argparse
import io
import json
import math
import struct
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

GAME_ORIGIN_E = 652087.0
GAME_ORIGIN_N = 6862038.0
SOURCE_STEP = 0.5
SOURCE_TILE_M = 1000.0
ORTHO_TILE_M = 2000.0
ORTHO_PIXELS = 4096


def add_view(binary, views, payload, target=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    binary.extend(payload)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
    if target is not None:
        view["target"] = target
    views.append(view)
    return len(views) - 1


def write_glb(path, positions, uv, indices, texture_jpeg):
    positions = np.asarray(positions, dtype="<f4").reshape(-1, 3)
    uv = np.asarray(uv, dtype="<f4").reshape(-1, 2)
    indices = np.asarray(indices, dtype="<u4").reshape(-1)
    if not len(positions) or len(uv) != len(positions) or not len(indices) or len(indices) % 3:
        raise ValueError("géométrie terrain vide ou incohérente")
    binary, views = bytearray(), []
    p_view = add_view(binary, views, positions.tobytes(), 34962)
    uv_view = add_view(binary, views, uv.tobytes(), 34962)
    i_view = add_view(binary, views, indices.tobytes(), 34963)
    image_view = add_view(binary, views, texture_jpeg)
    lo = positions.min(axis=0).astype(float).tolist()
    hi = positions.max(axis=0).astype(float).tolist()
    gltf = {
        "asset": {"version": "2.0", "generator": "Appart Studio LiDAR HD terrain"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Terrain_LiDAR_HD"}],
        "meshes": [{"name": "Terrain_LiDAR_HD", "primitives": [{
            "attributes": {"POSITION": 0, "TEXCOORD_0": 1},
            "indices": 2, "material": 0, "mode": 4
        }]}],
        "materials": [{"name": "Orthophoto IGN", "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 1.0
        }}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "images": [{"bufferView": image_view, "mimeType": "image/jpeg"}],
        "textures": [{"sampler": 0, "source": 0}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": p_view, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": lo, "max": hi},
            {"bufferView": uv_view, "componentType": 5126, "count": len(uv), "type": "VEC2"},
            {"bufferView": i_view, "componentType": 5125, "count": len(indices), "type": "SCALAR",
             "min": [int(indices.min())], "max": [int(indices.max())]}
        ],
        "buffers": [{"byteLength": 0}]
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(binary)
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(binary), 0x004E4942))
        f.write(binary)


def sample_mnt_grid(source, xmin, ymin, east, north):
    """Interpolation bilinéaire dans les 36 dalles MNT HD 1 km / 0,5 m."""
    out = np.full(east.shape, np.nan, dtype=np.float32)
    si = np.clip(np.floor((east - xmin) / SOURCE_TILE_M).astype(int), 0, 5)
    sj = np.clip(np.floor((north - ymin) / SOURCE_TILE_M).astype(int), 0, 5)
    for i in np.unique(si):
        for j in np.unique(sj):
            mask = (si == i) & (sj == j)
            if not mask.any():
                continue
            path = source / f"mnt_hd_{i}_{j}.tif"
            if not path.is_file():
                continue
            raster = np.asarray(tifffile.imread(path), dtype=np.float32)
            if raster.shape != (2000, 2000):
                raise ValueError(f"{path}: raster attendu 2000x2000, reçu {raster.shape}")
            x0, y0 = xmin + i * SOURCE_TILE_M, ymin + j * SOURCE_TILE_M
            col = np.clip((east[mask] - x0) / SOURCE_STEP - 0.5, 0, 1998.999)
            row = np.clip((y0 + SOURCE_TILE_M - north[mask]) / SOURCE_STEP - 0.5, 0, 1998.999)
            c0, r0 = np.floor(col).astype(int), np.floor(row).astype(int)
            fc, fr = col - c0, row - r0
            a = raster[r0, c0]; b = raster[r0, c0 + 1]
            d = raster[r0 + 1, c0]; e = raster[r0 + 1, c0 + 1]
            values = a * (1-fc) * (1-fr) + b * fc * (1-fr) + d * (1-fc) * fr + e * fc * fr
            valid = np.isfinite(values) & (values > -100) & (values < 1000)
            indices = np.flatnonzero(mask)
            out.flat[indices[valid]] = values[valid]
    return out


def make_ortho_texture(source, xmin, ymin, east0, north0, size):
    """Assemble la texture 4096² du terrain depuis les dalles orthophoto WMS."""
    texture = Image.new("RGB", (ORTHO_PIXELS, ORTHO_PIXELS), (85, 105, 78))
    east1, north1 = east0 + size, north0 + size
    i0 = max(0, int(math.floor((east0 - xmin) / ORTHO_TILE_M)))
    i1 = min(2, int(math.floor((east1 - xmin - 1e-6) / ORTHO_TILE_M)))
    j0 = max(0, int(math.floor((north0 - ymin) / ORTHO_TILE_M)))
    j1 = min(2, int(math.floor((north1 - ymin - 1e-6) / ORTHO_TILE_M)))
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            path = source / f"ortho_{i}_{j}.jpg"
            if not path.is_file():
                continue
            sx0, sy0 = xmin + i * ORTHO_TILE_M, ymin + j * ORTHO_TILE_M
            ix0, ix1 = max(east0, sx0), min(east1, sx0 + ORTHO_TILE_M)
            iy0, iy1 = max(north0, sy0), min(north1, sy0 + ORTHO_TILE_M)
            if ix1 <= ix0 or iy1 <= iy0:
                continue
            src = Image.open(path).convert("RGB")
            crop_box = (
                round((ix0-sx0)/ORTHO_TILE_M*ORTHO_PIXELS),
                round((sy0+ORTHO_TILE_M-iy1)/ORTHO_TILE_M*ORTHO_PIXELS),
                round((ix1-sx0)/ORTHO_TILE_M*ORTHO_PIXELS),
                round((sy0+ORTHO_TILE_M-iy0)/ORTHO_TILE_M*ORTHO_PIXELS)
            )
            dest_box = (
                round((ix0-east0)/size*ORTHO_PIXELS),
                round((north0+size-iy1)/size*ORTHO_PIXELS),
                round((ix1-east0)/size*ORTHO_PIXELS),
                round((north0+size-iy0)/size*ORTHO_PIXELS)
            )
            crop = src.crop(crop_box)
            dest_size = (max(1, dest_box[2]-dest_box[0]), max(1, dest_box[3]-dest_box[1]))
            if crop.size != dest_size:
                crop = crop.resize(dest_size, Image.Resampling.LANCZOS)
            texture.paste(crop, dest_box[:2])
    buf = io.BytesIO()
    texture.save(buf, "JPEG", quality=86, optimize=True)
    return buf.getvalue()


def build_tile(source, output, tile_i, tile_j, *, x0, y0, rx, ry, h0,
               origin_e=GAME_ORIGIN_E, origin_n=GAME_ORIGIN_N, step=4.0, size=2000.0):
    base_e, base_n = origin_e - rx, origin_n - ry
    east0, north0 = base_e + tile_i * size, base_n + tile_j * size
    xmin, ymin = x0 - 3000.0, y0 - 3000.0
    if east0 < xmin - 1e-6 or east0 + size > xmin + 6000 + 1e-6:
        return None
    if north0 < ymin - 1e-6 or north0 + size > ymin + 6000 + 1e-6:
        return None
    n = int(round(size / step)) + 1
    east = np.linspace(east0, east0 + size, n, dtype=np.float64)
    north = np.linspace(north0, north0 + size, n, dtype=np.float64)
    E, N = np.meshgrid(east, north)
    H = sample_mnt_grid(source, xmin, ymin, E, N)
    coverage = float(np.isfinite(H).mean())
    if coverage < 0.995:
        print(f"skip terrain_hd {tile_i}_{tile_j}: couverture MNT HD {coverage:.2%}")
        return None
    # Les rares nodata sont propagés depuis les voisins valides, sans recherche quadratique.
    missing = ~np.isfinite(H)
    for _ in range(8):
        if not missing.any():
            break
        padded = np.pad(H, 1, mode="edge")
        neighbours = [padded[:-2,1:-1], padded[2:,1:-1], padded[1:-1,:-2], padded[1:-1,2:]]
        valid = [np.isfinite(a) for a in neighbours]
        count = sum(v.astype(np.uint8) for v in valid)
        total = sum(np.where(v,a,0.0) for a,v in zip(neighbours,valid))
        fill = missing & (count > 0)
        H[fill] = (total[fill] / count[fill]).astype(np.float32)
        missing = ~np.isfinite(H)
    if missing.any():
        H[missing] = float(np.nanmean(H))
    positions = np.stack([E - origin_e, H - h0, -(N - origin_n)], axis=-1).astype("<f4").reshape(-1, 3)
    U = ((E - east0) / size).astype("<f4")
    V = ((north0 + size - N) / size).astype("<f4")
    uv = np.stack([U, V], axis=-1).reshape(-1, 2)
    a, b = np.meshgrid(np.arange(n-1, dtype=np.uint32), np.arange(n-1, dtype=np.uint32))
    v00 = (b*n + a).ravel()
    indices = np.stack([v00, v00+1, v00+n+1, v00, v00+n+1, v00+n], axis=-1).ravel()
    texture = make_ortho_texture(source, xmin, ymin, east0, north0, size)
    output.mkdir(parents=True, exist_ok=True)
    path = output / f"t_{tile_i}_{tile_j}.wasm"
    write_glb(path, positions, uv, indices, texture)
    print(f"terrain_hd {tile_i}_{tile_j}: {n}x{n}, {coverage:.2%} MNT HD, {path.stat().st_size} bytes")
    return {"tile": f"{tile_i}_{tile_j}", "vertices": int(len(positions)),
            "triangles": int(len(indices)//3), "coverage": coverage, "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--x0", type=float, required=True, help="Est Lambert-93 du centre de téléchargement")
    parser.add_argument("--y0", type=float, required=True, help="Nord Lambert-93 du centre de téléchargement")
    parser.add_argument("--step", type=float, default=4.0)
    args = parser.parse_args()
    idx_path = Path("data/paris/secteurs/index.json")
    if not idx_path.is_file():
        raise SystemExit("data/paris/secteurs/index.json absent : repère runtime inconnu")
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    rx, ry, h0 = float(idx["RX"]), float(idx["RY"]), float(idx["H0"])
    xmin, ymin = args.x0 - 3000, args.y0 - 3000
    base_e, base_n = GAME_ORIGIN_E-rx, GAME_ORIGIN_N-ry
    imin = math.ceil((xmin-base_e)/2000)
    imax = math.floor((xmin+6000-2000-base_e)/2000)
    jmin = math.ceil((ymin-base_n)/2000)
    jmax = math.floor((ymin+6000-2000-base_n)/2000)
    built = []
    for i in range(imin, imax+1):
        for j in range(jmin, jmax+1):
            result = build_tile(args.source,args.output,i,j,x0=args.x0,y0=args.y0,rx=rx,ry=ry,h0=h0,step=args.step)
            if result: built.append(result)
    index = {"source":"IGN LiDAR HD MNT 50 cm","mesh_step_m":args.step,
             "source_pixel_m":SOURCE_STEP,"fallback":"../terrain/t_<i>_<j>.wasm",
             "tiles":built}
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/"index.json").write_text(json.dumps(index,indent=2)+"\n",encoding="utf-8")
    if not built:
        raise SystemExit("Aucune tuile terrain HD complète générée ; fallback runtime conservé")
    print(f"OK : {len(built)} tuiles terrain runtime LiDAR HD")


if __name__ == "__main__":
    main()
