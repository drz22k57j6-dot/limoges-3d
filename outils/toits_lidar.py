"""Reconstruction prudente des toitures depuis le MNH LiDAR HD (EPSG:2154).

MNH est une hauteur normalisée au sol, échantillonnée sur une grille régulière.
Les fonctions sont pures hors dépendances numpy/shapely/mapbox-earcut pour être
testables sur de petits rasters synthétiques hors réseau.
"""
import math
import numpy as np
from shapely.geometry import Point, Polygon, MultiPolygon, GeometryCollection, box
from shapely.prepared import prep
import mapbox_earcut as earcut


def sample_raster(raster, x, y, xmin, ymax, resolution=2.0):
    """Interpolation bilinéaire au centre des pixels, même convention que build.py."""
    a = np.asarray(raster, dtype=np.float64)
    xx, yy = np.broadcast_arrays(np.asarray(x, dtype=float), np.asarray(y, dtype=float))
    c = np.clip((xx - xmin) / resolution - 0.5, 0, a.shape[1] - 1.001)
    r = np.clip((ymax - yy) / resolution - 0.5, 0, a.shape[0] - 1.001)
    c0 = np.floor(c).astype(int); r0 = np.floor(r).astype(int)
    fc = c - c0; fr = r - r0
    return (a[r0, c0] * (1-fc) * (1-fr) + a[r0, c0+1] * fc * (1-fr)
            + a[r0+1, c0] * (1-fc) * fr + a[r0+1, c0+1] * fc * fr)


def _isolated_high_mask(mnh, threshold):
    high = np.isfinite(mnh) & (mnh > threshold)
    padded = np.pad(high.astype(np.uint8), 1)
    neighbours = np.zeros(high.shape, dtype=np.uint8)
    for dy in range(3):
        for dx in range(3):
            if dx == 1 and dy == 1:
                continue
            neighbours += padded[dy:dy+high.shape[0], dx:dx+high.shape[1]]
    # Un pic isolé > hauteur BD TOPO + 3 m est probablement un arbre.
    return high & (neighbours <= 1)


def collect_roof_samples(poly, mnh, xmin, ymax, building_height,
                         resolution=2.0, edge_exclusion=0.5,
                         facade_band=3.0, tree_mask=None):
    """Renvoie les hauteurs MNH intérieures, et le sous-ensemble proche des façades."""
    interior = poly.buffer(-edge_exclusion)
    if interior.is_empty:
        interior = poly
    prepared = prep(interior)
    h, w = mnh.shape
    minx, miny, maxx, maxy = poly.bounds
    c0 = max(0, int(math.floor((minx-xmin)/resolution)))
    c1 = min(w-1, int(math.ceil((maxx-xmin)/resolution)))
    r0 = max(0, int(math.floor((ymax-maxy)/resolution)))
    r1 = min(h-1, int(math.ceil((ymax-miny)/resolution)))
    # Calculer le masque d'isolés uniquement sur la fenêtre du bâtiment (+1 pixel),
    # jamais sur les 9 millions de pixels du raster pour chaque bâtiment.
    lr0, lr1 = max(0,r0-1), min(h,r1+2)
    lc0, lc1 = max(0,c0-1), min(w,c1+2)
    isolated_local = _isolated_high_mask(mnh[lr0:lr1,lc0:lc1], float(building_height)+3.0)
    facade_core = poly.buffer(-facade_band)
    prepared_core = prep(facade_core) if not facade_core.is_empty else None
    values, edge_values = [], []
    for row in range(r0, r1+1):
        y = ymax-(row+0.5)*resolution
        for col in range(c0, c1+1):
            value = float(mnh[row, col])
            if not math.isfinite(value) or value <= 0.5:
                continue
            if tree_mask is not None and bool(tree_mask[row, col]):
                continue
            if isolated_local[row-lr0, col-lc0]:
                continue
            x = xmin+(col+0.5)*resolution
            point = Point(x, y)
            if not prepared.covers(point):
                continue
            values.append(value)
            if prepared_core is None or not prepared_core.covers(point):
                edge_values.append(value)
    return np.asarray(values, dtype=float), np.asarray(edge_values, dtype=float)


def estimate_roof(poly, mnh, xmin, ymax, building_height,
                  resolution=2.0, tree_mask=None):
    """Estime l'égout (P15 proche des façades) et le faîtage (P95 global).

    Un écart de plus de 6 m avec la hauteur BD TOPO invalide la reconstruction :
    l'appelant doit conserver sa géométrie de toit existante.
    """
    values, edge = collect_roof_samples(poly, mnh, xmin, ymax, building_height,
                                         resolution=resolution, tree_mask=tree_mask)
    if len(values) < 4:
        return {"valid": False, "reason": "moins de 4 pixels MNH valides", "samples": len(values)}
    eave = float(np.percentile(edge if len(edge) >= 3 else values, 15))
    ridge = float(np.percentile(values, 95))
    if abs(ridge-float(building_height)) > 6.0:
        return {"valid": False, "reason": "écart MNH/BD TOPO supérieur à 6 m",
                "samples": len(values), "eave": eave, "ridge": ridge}
    if ridge < eave:
        return {"valid": False, "reason": "faîtage inférieur à l'égout",
                "samples": len(values), "eave": eave, "ridge": ridge}
    return {"valid": True, "eave": eave, "ridge": ridge,
            "mesh_max": float(max(ridge, np.max(values))),
            "samples": len(values), "edge_samples": len(edge)}


def _polygon_parts(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type in ("MultiPolygon", "GeometryCollection"):
        out = []
        for g in geom.geoms:
            out.extend(_polygon_parts(g))
        return out
    return []


def build_roof_mesh(poly, mnh, xmin, ymax, ground_sampler, eave, mesh_max,
                    resolution=2.0, triangle_budget=400):
    """Maillage raster découpé exactement par l'emprise ; ≤ triangle_budget faces.

    Les cellules sont adaptativement agrandies pour plafonner le nombre de triangles.
    Les trous et contours de l'emprise sont respectés par intersection Shapely + Earcut.
    """
    from shapely.geometry import box as make_box
    step = max(1.0, float(resolution))
    result = None
    for _ in range(7):
        positions, indices, vertex_map = [], [], {}
        minx, miny, maxx, maxy = poly.bounds
        # Aligner la grille sur les centres MNH (et non sur des multiples arbitraires
        # de zéro) pour conserver les émergences visibles à la résolution LiDAR.
        x_anchor = xmin + resolution/2
        y_anchor = ymax - resolution/2
        gx0 = x_anchor + math.floor((minx-x_anchor)/step)*step
        gy0 = y_anchor - math.ceil((y_anchor-miny)/step)*step
        x = gx0
        while x < maxx:
            y = gy0
            while y < maxy:
                clipped = poly.intersection(make_box(x, y, x+step, y+step))
                for piece in _polygon_parts(clipped):
                    if piece.area < 0.02:
                        continue
                    rings = [np.asarray(piece.exterior.coords)[:-1]]
                    rings += [np.asarray(r.coords)[:-1] for r in piece.interiors]
                    if not rings[0].size:
                        continue
                    verts = np.vstack(rings)
                    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
                    tri = np.asarray(earcut.triangulate_float64(verts, ends), dtype=np.uint32).reshape(-1, 3)
                    if not len(tri):
                        continue
                    # Normales orientées vers le haut dans le repère du jeu (Y = altitude).
                    aa, bb, cc = verts[tri[:,0]], verts[tri[:,1]], verts[tri[:,2]]
                    cross = (bb[:,0]-aa[:,0])*(cc[:,1]-aa[:,1])-(bb[:,1]-aa[:,1])*(cc[:,0]-aa[:,0])
                    tri[cross < 0] = tri[cross < 0][:,[0,2,1]]
                    zrel = sample_raster(mnh, verts[:,0], verts[:,1], xmin, ymax, resolution)
                    zrel = np.clip(zrel, max(0.0, eave-0.2), mesh_max)
                    ground = np.asarray(ground_sampler(verts[:,0], verts[:,1]), dtype=float)
                    xyz = np.column_stack([verts[:,0], verts[:,1], ground+zrel])
                    local = np.empty(len(xyz), dtype=np.uint32)
                    for vi, point in enumerate(xyz):
                        key = (round(float(point[0]), 3), round(float(point[1]), 3))
                        if key not in vertex_map:
                            vertex_map[key] = len(positions)
                            positions.append(point)
                        local[vi] = vertex_map[key]
                    indices.append(local[tri.reshape(-1)])
                y += step
            x += step
        if positions and indices:
            p = np.asarray(positions, dtype=float); idx = np.concatenate(indices)
            result = (p, idx)
            if len(idx)//3 <= triangle_budget:
                break
        step *= 1.35
    if result is None:
        return np.empty((0,3), dtype=float), np.empty((0,), dtype=np.uint32), step
    return result[0], result[1], step
