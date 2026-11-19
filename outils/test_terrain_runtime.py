import json
import struct
import tempfile
import unittest
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

from terrain_runtime import build_tile, sample_mnt_grid, write_glb


class TerrainRuntimeTests(unittest.TestCase):
    def test_glb_writer_emits_valid_glb2_with_runtime_attributes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tile.wasm"
            positions = np.array([[0, 1, 0], [1, 1, 0], [0, 1, -1]], dtype=np.float32)
            uv = np.array([[0, 0], [1, 0], [0, 1]], dtype=np.float32)
            indices = np.array([0, 1, 2], dtype=np.uint32)
            write_glb(path, positions, uv, indices, b"fake-jpeg-payload")
            data = path.read_bytes()
            magic, version, total = struct.unpack_from("<III", data, 0)
            json_len, json_magic = struct.unpack_from("<II", data, 12)
            doc = json.loads(data[20:20+json_len].decode("utf-8").strip())
            self.assertEqual(magic, 0x46546C67)
            self.assertEqual(version, 2)
            self.assertEqual(total, len(data))
            self.assertEqual(json_magic, 0x4E4F534A)
            self.assertEqual(doc["accessors"][0]["count"], 3)
            self.assertEqual(doc["accessors"][1]["count"], 3)
            self.assertEqual(doc["accessors"][2]["count"], 3)
            self.assertEqual(doc["meshes"][0]["primitives"][0]["attributes"], {"POSITION": 0, "TEXCOORD_0": 1})

    def test_mnt_hd_bilinear_sampling_handles_1km_tile_borders(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            for i in range(2):
                for j in range(2):
                    tifffile.imwrite(source / f"mnt_hd_{i}_{j}.tif",
                                     np.full((2000, 2000), 40 + i + j, dtype=np.uint16))
            east, north = np.meshgrid(np.array([0.5, 1000.0, 1999.5]),
                                      np.array([0.5, 1000.0, 1999.5]))
            heights = sample_mnt_grid(source, 0.0, 0.0, east, north)
            self.assertTrue(np.isfinite(heights).all())
            self.assertEqual(heights.shape, (3, 3))

    def test_build_tile_creates_streamable_runtime_glb(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / "source"; output = root / "terrain_hd"
            source.mkdir()
            # The selected 2 km runtime tile exactly matches these four 1 km MNT HD tiles.
            for i in range(2):
                for j in range(2):
                    tifffile.imwrite(source / f"mnt_hd_{i}_{j}.tif",
                                     np.full((2000, 2000), 52, dtype=np.uint16))
            Image.new("RGB", (4096, 4096), (120, 130, 110)).save(source / "ortho_0_0.jpg", quality=85)
            result = build_tile(source, output, 5, 3, x0=655087.0, y0=6865038.0,
                                rx=10000.0, ry=6000.0, h0=26.93, step=4.0)
            self.assertIsNotNone(result)
            path = output / "t_5_3.wasm"
            self.assertTrue(path.is_file())
            magic, version, total = struct.unpack_from("<III", path.read_bytes(), 0)
            self.assertEqual((magic, version, total), (0x46546C67, 2, path.stat().st_size))
            self.assertEqual(result["coverage"], 1.0)
            self.assertEqual(result["vertices"], 501 * 501)
            self.assertEqual(result["triangles"], 500 * 500 * 2)


if __name__ == "__main__":
    unittest.main()
