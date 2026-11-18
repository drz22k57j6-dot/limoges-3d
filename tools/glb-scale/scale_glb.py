#!/usr/bin/env python3
"""Rescale a Meshy GLB to measured real-world building dimensions.

Coordinate convention: X=facade length, Y=height (up), Z=depth.
All target dimensions are metres. The exported GLB is grounded at Y=0.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import trimesh


def bounds_size(obj):
    bounds = np.asarray(obj.bounds, dtype=float)
    if bounds.shape != (2, 3) or not np.isfinite(bounds).all():
        raise ValueError("Impossible de calculer les dimensions du modèle.")
    return bounds, bounds[1] - bounds[0]


def main():
    p = argparse.ArgumentParser(description="Met un GLB aux dimensions réelles.")
    p.add_argument("input", type=Path, help="GLB Meshy source")
    p.add_argument("output", type=Path, help="GLB corrigé")
    p.add_argument("--length", type=float, required=True, help="Longueur façade en mètres (axe X)")
    p.add_argument("--height", type=float, required=True, help="Hauteur totale en mètres (axe Y)")
    p.add_argument("--depth", type=float, required=True, help="Profondeur en mètres (axe Z)")
    p.add_argument("--mode", choices=("exact", "uniform"), default="exact",
                   help="exact=respecte les 3 mesures (peut déformer); uniform=conserve les proportions")
    p.add_argument("--uniform-reference", choices=("length", "height", "depth"), default="height",
                   help="Dimension de référence en mode uniform")
    p.add_argument("--report", type=Path, default=None, help="Chemin JSON du rapport")
    args = p.parse_args()

    targets = np.array([args.length, args.height, args.depth], dtype=float)
    if not args.input.is_file():
        p.error(f"Fichier introuvable: {args.input}")
    if not np.isfinite(targets).all() or np.any(targets <= 0):
        p.error("Les trois dimensions doivent être des nombres positifs en mètres.")

    loaded = trimesh.load(args.input, force="scene")
    if not isinstance(loaded, trimesh.Scene):
        loaded = trimesh.Scene(loaded)
    if not loaded.geometry:
        raise ValueError("Le GLB ne contient aucune géométrie exploitable.")

    original_bounds, original = bounds_size(loaded)
    if np.any(original <= 1e-9):
        raise ValueError(f"Dimensions source invalides: {original.tolist()}")

    if args.mode == "exact":
        factors = targets / original
        warning = ("Mise à l'échelle indépendante sur X/Y/Z : les proportions peuvent être "
                   "légèrement ou fortement déformées si le GLB source n'a pas les bonnes proportions.")
    else:
        idx = {"length": 0, "height": 1, "depth": 2}[args.uniform_reference]
        factor = targets[idx] / original[idx]
        factors = np.array([factor, factor, factor])
        warning = ("Proportions conservées. Les dimensions finales peuvent différer des trois "
                   "dimensions demandées; seule la dimension de référence est garantie.")

    # Transform the whole scene in world coordinates, then move its lowest point to Y=0.
    matrix = np.eye(4)
    matrix[0, 0], matrix[1, 1], matrix[2, 2] = factors
    loaded.apply_transform(matrix)
    scaled_bounds, scaled = bounds_size(loaded)
    ground = np.eye(4)
    ground[1, 3] = -scaled_bounds[0, 1]
    loaded.apply_transform(ground)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    loaded.export(args.output, file_type="glb")

    # Re-open the exported file so the report describes the actual deliverable.
    check = trimesh.load(args.output, force="scene")
    final_bounds, final = bounds_size(check)
    report = {
        "source": str(args.input),
        "output": str(args.output),
        "units": "metres",
        "axis_convention": {"X": "facade_length", "Y": "height_up", "Z": "depth"},
        "mode": args.mode,
        "requested_dimensions_m": {"length": args.length, "height": args.height, "depth": args.depth},
        "source_dimensions_model_units": {"length_X": float(original[0]), "height_Y": float(original[1]), "depth_Z": float(original[2])},
        "scale_factors": {"X": float(factors[0]), "Y": float(factors[1]), "Z": float(factors[2])},
        "exported_dimensions": {"length_X": float(final[0]), "height_Y": float(final[1]), "depth_Z": float(final[2])},
        "ground_level_Y": float(final_bounds[0, 1]),
        "warning": warning,
    }
    report_path = args.report or args.output.with_suffix(".report.json")
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nGLB prêt : {args.output}")
    print(f"Rapport : {report_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERREUR: {exc}", file=sys.stderr)
        raise
