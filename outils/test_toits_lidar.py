import math
import unittest
import numpy as np
from shapely.geometry import Polygon
from toits_lidar import estimate_roof, build_roof_mesh, collect_roof_samples

class LidarRoofSyntheticTests(unittest.TestCase):
    def setUp(self):
        self.res=2.0
        self.xmin=0.0
        self.ymax=40.0
        self.n=20
        self.x=np.arange(self.n)*2+1
        self.y=self.ymax-(np.arange(self.n)*2+1)
        self.xx,self.yy=np.meshgrid(self.x,self.y)
        self.poly=Polygon([(4,4),(36,4),(36,36),(4,36)])
        self.ground=lambda x,y: np.zeros_like(np.asarray(x,dtype=float))

    def _estimate(self, raster, height):
        return estimate_roof(self.poly,raster,self.xmin,self.ymax,height,resolution=self.res)

    def test_two_pitch_roof_eave_and_ridge_within_30cm(self):
        # Égout 8 m sur les bords, faîtage 10 m au centre.
        profile=8.0+2.0*(1.0-np.abs(self.xx-20.0)/16.0)
        roof=np.clip(profile,8.0,10.0).astype(np.float32)
        got=self._estimate(roof,10.0)
        self.assertTrue(got["valid"],got)
        self.assertLessEqual(abs(got["eave"]-8.0),0.3)
        self.assertLessEqual(abs(got["ridge"]-10.0),0.3)

    def test_mansard_profile_preserves_breaks_and_height(self):
        d=np.abs(self.xx-20.0)
        profile=np.where(d>10,8.0+(10-d)*0.18,9.8)
        roof=np.clip(profile,8.0,9.8).astype(np.float32)
        got=self._estimate(roof,9.8)
        self.assertTrue(got["valid"],got)
        self.assertLessEqual(abs(got["eave"]-8.0),0.3)
        self.assertLessEqual(abs(got["ridge"]-9.8),0.3)

    def test_terrace_keeps_emergence_over_15m(self):
        roof=np.full((self.n,self.n),8.0,dtype=np.float32)
        roof[8:11,8:11]=10.2
        got=self._estimate(roof,10.2)
        self.assertTrue(got["valid"],got)
        verts,indices,step=build_roof_mesh(self.poly,roof,self.xmin,self.ymax,self.ground,got["eave"],got["mesh_max"],resolution=self.res)
        self.assertGreater(len(indices),0)
        self.assertGreater(float(verts[:,2].max()),9.5) # émergence > 1,5 m au-dessus de la terrasse

    def test_isolated_high_pixel_is_filtered_but_supported_cluster_is_kept(self):
        roof=np.full((self.n,self.n),8.0,dtype=np.float32)
        roof[8,8]=20.0
        roof[12:14,12:14]=12.0
        values,edge=collect_roof_samples(self.poly,roof,self.xmin,self.ymax,8.0,resolution=self.res)
        self.assertNotIn(20.0,values.tolist())
        self.assertGreaterEqual(int(np.count_nonzero(values==12.0)),4)

    def test_height_guard_falls_back_to_bd_topo(self):
        roof=np.full((self.n,self.n),18.0,dtype=np.float32)
        got=estimate_roof(self.poly,roof,self.xmin,self.ymax,8.0,resolution=self.res)
        self.assertFalse(got["valid"])
        self.assertIn("écart",got["reason"])

    def test_mesh_respects_budget_and_building_holes(self):
        polygon=Polygon([(4,4),(36,4),(36,36),(4,36)], [[(14,14),(14,26),(26,26),(26,14)]])
        roof=np.full((self.n,self.n),8.0,dtype=np.float32)
        got=estimate_roof(self.poly,roof,self.xmin,self.ymax,8.0,resolution=self.res)
        verts,indices,step=build_roof_mesh(polygon,roof,self.xmin,self.ymax,self.ground,got["eave"],got["mesh_max"],resolution=self.res,triangle_budget=400)
        self.assertLessEqual(len(indices)//3,400)
        faces=verts[indices.reshape(-1,3)]
        cross=(faces[:,1,0]-faces[:,0,0])*(faces[:,2,1]-faces[:,0,1])-(faces[:,1,1]-faces[:,0,1])*(faces[:,2,0]-faces[:,0,0])
        self.assertTrue(np.all(cross>0))
        # Tous les centres de triangles restent dans l'emprise, donc jamais dans la cour.
        for tri in verts[indices.reshape(-1,3)].mean(axis=1):
            self.assertTrue(polygon.covers(__import__('shapely').geometry.Point(float(tri[0]),float(tri[1]))))

if __name__ == "__main__":
    unittest.main()
