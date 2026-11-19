import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "paris" / "vegetation"

class ParisVegetationDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))

    def test_every_indexed_sector_has_valid_json(self):
        self.assertGreater(len(self.index["secteurs"]), 100)
        for key in self.index["secteurs"]:
            path = DATA / f"{key}.json"
            self.assertTrue(path.is_file(), f"missing sector {key}")
            d = json.loads(path.read_text(encoding="utf-8"))
            self.assertTrue(all(isinstance(d.get(k), list) for k in ("a", "h", "m")), key)

    def test_tree_rows_match_runtime_contract(self):
        total = 0
        for key in self.index["secteurs"]:
            d = json.loads((DATA / f"{key}.json").read_text(encoding="utf-8"))
            for row in d["a"]:
                self.assertEqual(len(row), 8, key)
                x,z,species,height,crown,trunk,stage,seed = row
                self.assertTrue(all(math.isfinite(float(v)) for v in (x,z,height,crown,trunk)))
                self.assertGreater(height, 0)
                self.assertGreater(crown, 0)
                self.assertGreaterEqual(species, 0)
                total += 1
        self.assertGreater(total, 200_000)

    def test_hedge_and_massif_geometry(self):
        hedge_count = massif_count = 0
        for key in self.index["secteurs"]:
            d = json.loads((DATA / f"{key}.json").read_text(encoding="utf-8"))
            for row in d["h"]:
                self.assertEqual(len(row), 3, key)
                self.assertGreaterEqual(len(row[0]), 2)
                self.assertGreater(row[1], 0)
                self.assertGreater(row[2], 0)
                hedge_count += 1
            for row in d["m"]:
                self.assertEqual(len(row), 2, key)
                self.assertGreaterEqual(len(row[0]), 3)
                self.assertGreater(row[1], 0)
                massif_count += 1
        self.assertGreater(hedge_count, 1000)
        self.assertGreater(massif_count, 1000)

if __name__ == "__main__":
    unittest.main()
